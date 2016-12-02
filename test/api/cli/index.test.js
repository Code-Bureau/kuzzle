var
  rewire = require('rewire'),
  should = require('should'),
  sinon = require('sinon'),
  sandbox = sinon.sandbox.create(),
  KuzzleMock = require('../../mocks/kuzzle.mock'),
  Action = require('../../../lib/api/cli/action'),
  Cli = rewire('../../../lib/api/cli/index');

describe('Tests: api/cli/index.js', () => {
  var
    kuzzle;

  beforeEach(() => {
    kuzzle = new KuzzleMock();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', () => {
    it('should build proper properties', () => {
      var cli = new Cli(kuzzle);
      should(cli.actions).be.Object();
      should(cli.actions.adminExists).be.a.Action();
      should(cli.actions.clearCache).be.a.Action();
      should(cli.actions.cleanDb).be.a.Action();
      should(cli.actions.createFirstAdmin).be.a.Action();
      should(cli.actions.data).be.a.Action();
      should(cli.actions.dump).be.a.Action();
      should(cli.actions.manaPlugins).be.a.Action();
      should(cli.actions.manaPlugins.timeout).be.eql(1000);
      should(cli.actions.manaPlugins.timeOutCB).be.Function();
      should(cli.do).be.a.Function();
    });
  });

  describe('#do', () => {
    var
      cli,
      reset;

    beforeEach(() => {
      var requireStub = sinon.stub();
      requireStub.withArgs('../../config').returns(kuzzle.config);
      requireStub.returns();

      reset = Cli.__set__({
        console: {
          log: sinon.spy(),
          error: sinon.spy()
        },
        require: requireStub,
        PluginsManager: sinon.stub().returns({
          init: sinon.stub().returns(Promise.resolve()),
          run: sinon.stub().returns(Promise.resolve())
        }),
        process: {
          exit: sinon.spy(),
          kill: sinon.spy()
        },
        InternalBroker: sinon.stub().returns({
          init: sinon.stub().returns(Promise.resolve()),
          listen: sinon.spy(),
          broadcast: sinon.spy(),
          send: sinon.spy()
        })
      });
      cli = new Cli(kuzzle);
    });

    afterEach(() => {
      reset();
    });

    it('should send the action to the internalBroker', () => {
      var
        data = {foo: 'bar'},
        context = {
          kuzzle: kuzzle,
          actions: {
            test: {
              onListenCB: sinon.spy(),
              initTimeout: sinon.spy(),
              prepareData: sinon.stub().returns(data),
              deferred: {
                promise: 'promise'
              }
            }
          }
        };

      return cli.do.call(context, 'test', {})
        .then(response => {
          should(response).be.exactly('promise');
          should(kuzzle.services.list.broker.listen).be.calledOnce();
          should(kuzzle.services.list.broker.listen.firstCall.args[1]).be.a.Function();
          should(kuzzle.services.list.broker.send).be.calledOnce();
          should(kuzzle.services.list.broker.send.firstCall.args[0]).be.exactly('cli-queue');
          should(kuzzle.services.list.broker.send.firstCall.args[1]).match({
            controller: 'actions',
            action: 'test',
            data: {
              body: data
            }
          });
          should(context.actions.test.initTimeout).be.calledOnce();
        });

    });

    it('should output the error to the console if any', () => {
      var
        error = new Error('test'),
        context = {
          actions: {
            action: {
              onListenCB: sinon.spy()
            }
          }
        };

      kuzzle.internalEngine.init.returns(Promise.reject(error));

      return cli.do.call(context, 'action', 'data', {debug: true})
        .catch(err => {
          should(err).be.exactly(error);
          should(Cli.__get__('console.error'))
            .be.calledOnce()
            .be.calledWith(error.stack);
        });
    });
  });

});
