'use strict';

const should = require('should');
const sinon = require('sinon');

const KuzzleMock = require('../../../mocks/kuzzle.mock');

const HotelClerk = require('../../../../lib/core/realtime/hotelClerk');

describe('Test: hotelClerk.disconnect', () => {
  const connectionId = 'connectionid';
  const collection = 'user';
  const index = '%test';
  let kuzzle;
  let hotelClerk;
  let realtimeModule;

  beforeEach(() => {
    kuzzle = new KuzzleMock();

    realtimeModule = {
      notifier: {
        notifyUser: sinon.stub(),
      }
    };

    hotelClerk = new HotelClerk(kuzzle, realtimeModule);

    hotelClerk.customers.set(connectionId, new Map([
      [ 'foo', { volatile: 'room foo' } ],
      [ 'bar', { volatile: 'room bar' } ]
    ]));
    hotelClerk.customers.set('a', new Map([['foo', null]]));
    hotelClerk.customers.set('b', new Map([['foo', null]]));

    hotelClerk.rooms.set('foo', {
      customers: new Set([connectionId, 'a', 'b']),
      index,
      collection,
      channels: ['foobar']
    });
    hotelClerk.rooms.set('bar', {
      customers: new Set([connectionId]),
      index,
      collection,
      channels: ['barfoo']
    });

    hotelClerk.roomsCount = 2;

    return hotelClerk.init();
  });

  it('should register a "disconnect" event', async () => {
    sinon.stub(hotelClerk, 'disconnect');

    kuzzle.ask.restore();
    await kuzzle.ask('core:realtime:disconnect', 'connectionId');

    should(hotelClerk.disconnect).calledWith('connectionId');
  });

  it('should do nothing when a bad connectionId is given', async () => {
    sinon.stub(hotelClerk, 'unsubscribe');

    await hotelClerk.disconnect('nope');

    should(hotelClerk.unsubscribe).not.be.called();
    should(hotelClerk.roomsCount).be.eql(2);
  });

  it('should clean up customers, rooms object', async () => {
    await hotelClerk.disconnect(connectionId);

    should(kuzzle.koncorde.remove).be.calledOnce();

    should(hotelClerk.rooms).have.value('foo', {
      customers: new Set(['a', 'b']),
      index,
      collection,
      channels: ['foobar']
    });
    should(hotelClerk.rooms).not.have.key('bar');

    should(hotelClerk.customers.get('a')).have.value('foo', null);
    should(hotelClerk.customers.get('b')).have.value('foo', null);
    should(hotelClerk.roomsCount).be.eql(1);

    should(realtimeModule.notifier.notifyUser).calledWithMatch(
      'foo',
      {
        input: {
          resource: { index, collection },
          action: 'unsubscribe',
          controller: 'realtime',
          volatile: { volatile: 'room foo' },
        },
      },
      'out',
      { count: 2 });

    should(realtimeModule.notifier.notifyUser).calledWithMatch(
      'bar',
      {
        input: {
          resource: { index, collection },
          action: 'unsubscribe',
          controller: 'realtime',
          volatile: { volatile: 'room bar' },
        },
      },
      'out',
      { count: 0 });
  });

  it('should log an error if a problem occurs while unsubscribing', async () => {
    const error = new Error('Mocked error');
    realtimeModule.notifier.notifyUser.throws(error);

    await hotelClerk.disconnect(connectionId);

    should(kuzzle.log.error).be.calledWith(error);
  });
});