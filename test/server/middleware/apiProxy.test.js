var _ = require('underscore'),
    sinon = require('sinon'),
    apiProxy = require('./../../../server/middleware/apiProxy'),
    should = require('chai').should();

describe('apiProxy', function() {

  describe('middleware', function () {

    var dataAdapter, proxy, requestFromClient, responseToClient, requestToApi;

    beforeEach(function () {
      requestToApi = sinon.stub();
      requestFromClient = {
        path: '/',
        headers: { 'host': 'any.host.name', },
        connection: {},
        get: sinon.stub()
      },
      dataAdapter = { request: requestToApi },
      proxy = apiProxy(dataAdapter),
      responseToClient = { status: sinon.spy(), json: sinon.spy(), setHeader: sinon.spy() };
    });

    it('should pass through the status code', function () {
      dataAdapter.request.yields(null, {status: 200, headers: {}}, {});

      proxy(requestFromClient, responseToClient);

      responseToClient.status.should.have.been.calledOnce;
    });

    it('should pass through the body', function () {
      var body = { what: 'ever' };
      dataAdapter.request.yields(null, {status: 200, headers: {}}, body);

      proxy(requestFromClient, responseToClient);

      responseToClient.json.should.have.been.calledOnce;
      responseToClient.json.should.have.been.calledWith(body);
    });

    it('should add an x-forwarded-for header to the request', function () {
      var remoteAddress = '1.1.1.1',
          outgoingHeaders;

      requestFromClient.ip = remoteAddress;

      proxy(requestFromClient, responseToClient);

      requestToApi.should.have.been.calledOnce;
      outgoingHeaders = requestToApi.firstCall.args[1].headers;
      outgoingHeaders['x-forwarded-for'].should.eq(remoteAddress);
    });

    it('should extend an existing x-forwarded-for header', function () {
      var existingHeaderValue = '9.9.9.9, 6.6.6.6',
          remoteAddress = '1.1.1.1',
          expectedHeaderValue = '9.9.9.9, 6.6.6.6, 1.1.1.1',
          incomingHeaders = { 'x-forwarded-for': existingHeaderValue },
          outgoingHeaders;

      requestFromClient.headers = incomingHeaders;
      requestFromClient.ip = remoteAddress;

      proxy(requestFromClient, responseToClient);

      requestToApi.should.have.been.calledOnce;
      outgoingHeaders = requestToApi.firstCall.args[1].headers;
      outgoingHeaders['x-forwarded-for'].should.eq(expectedHeaderValue);
      outgoingHeaders['x-forwarded-for'].should.not.eq(
        incomingHeaders['x-forwarded-for']);
    });


    it('should not pass through the host header', function () {
      proxy(requestFromClient, responseToClient);
      outgoingHeaders = requestToApi.firstCall.args[1].headers;
      outgoingHeaders.should.not.contain.key('host');
    });

    describe('cookie forwarding', function () {
      it('should pass through prefixed cookies for the default api', function () {
        var cookiesReturnedByApi = [
            'FooBar=SomeCookieData; path=/',
            'BarFoo=OtherCookieData; path=/'
          ],
          expecetedEncodedCookies = [
            'default/-/FooBar=' + encodeURIComponent('FooBar=SomeCookieData; path=/'),
            'default/-/BarFoo=' + encodeURIComponent('BarFoo=OtherCookieData; path=/')
          ];


        dataAdapter.request.yields(null, { headers: { 'set-cookie': cookiesReturnedByApi } });
        proxy(requestFromClient, responseToClient);

        responseToClient.setHeader.should.have.been.calledOnce;
        responseToClient.setHeader.should.have.been.calledWith('set-cookie', expecetedEncodedCookies)
      });

      it('should pass through prefixed cookies', function () {
        var cookiesReturnedByApi = [ 'FooBar=SomeCookieData; path=/' ],
          expecetedEncodedCookies = [
            'apiName/-/FooBar=' + encodeURIComponent('FooBar=SomeCookieData; path=/')
          ];

        dataAdapter.request.yields(null, { headers: { 'set-cookie': cookiesReturnedByApi } });
        requestFromClient.path = '/apiName/-/';
        proxy(requestFromClient, responseToClient);

        responseToClient.setHeader.should.have.been.calledOnce;
        responseToClient.setHeader.should.have.been.calledWith('set-cookie', expecetedEncodedCookies)
      });

      it('should pass through the cookies from client to the correct api host', function () {
        var encodedClientCookies =
          'apiName/-/FooBar=' + encodeURIComponent('FooBar=SomeCookieData; path=/') +
          '; ' +
          'otherApi/-/BarFoo=' + encodeURIComponent('BarFoo=OtherCookieData; path=/');

        requestFromClient.get.withArgs('cookie').returns(encodedClientCookies);

        requestFromClient.path = '/apiName/-/';
        proxy(requestFromClient, responseToClient);
        dataAdapter.request.should.have.been.calledWithMatch(requestFromClient, {headers: {cookie: ['FooBar=SomeCookieData; path=/']}});

        requestFromClient.path = '/otherApi/-/';
        proxy(requestFromClient, responseToClient);
        dataAdapter.request.should.have.been.calledWithMatch(requestFromClient, {headers: {cookie: ['BarFoo=OtherCookieData; path=/']}});
      });

      it('should pass through the cookies from client to the default api host', function () {
        requestFromClient.get.withArgs('cookie').returns('default/-/FooBar=' + encodeURIComponent('FooBar=SomeCookieData; path=/'));
        proxy(requestFromClient, responseToClient);

        dataAdapter.request.should.have.been.calledOnce;
        dataAdapter.request.should.have.been.calledWithMatch(requestFromClient, {headers: {cookie: ['FooBar=SomeCookieData; path=/']}})
      });
    });
  });

  describe('getApiPath', function() {
    it('should support no separator', function() {
      should.equal(apiProxy.getApiPath("/some/path/to/resource"), "/some/path/to/resource");
    });

    it('should support a separator but no api name', function() {
      should.equal(apiProxy.getApiPath("/-/path/to/resource"), "/path/to/resource");
    });

    it('should support a separator with api name', function() {
      should.equal(apiProxy.getApiPath("/api-name/-/path/to/resource"), "/path/to/resource");
    });
  });

  describe('getApiName', function() {
    it('should support no separator', function() {
      should.equal(apiProxy.getApiName("/some/path/to/resource"), null);
    });

    it('should support a separator but no api name', function() {
      should.equal(apiProxy.getApiName("/-/path/to/resource"), null);
    });

    it('should support a separator with api name', function() {
      should.equal(apiProxy.getApiName("/api-name/-/path/to/resource"), "api-name");
    });
  });

});
