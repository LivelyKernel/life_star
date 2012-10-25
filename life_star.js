/*global require, module*/
var express = require('express'),
    DavHandler = require('jsDAV/lib/DAV/handler').jsDAV_Handler,
    FsTree = require('jsDAV/lib/DAV/tree/filesystem').jsDAV_Tree_Filesystem,
    defaultPlugins = require("jsDAV/lib/DAV/server").DEFAULT_PLUGINS,
    log4js = require('log4js'),
    proxy = require('./lib/proxy'),
    testing = require('./lib/testing'),
    auth = require('./lib/auth'),
    WorkspaceHandler = require('./lib/workspace').WorkspaceHandler,
    SubserverHandler = require('./lib/subservers').SubserverHandler,
    spawn = require('child_process').spawn,
    fs = require('fs'),
    path = require('path');

module.exports = function serverSetup(config) {

  config.host                = config.host || "localhost";
  config.port                = config.port || 9001;
  config.srvOptions          = config.srvOptions || {node: config.fsNode || "../LivelyKernel/"};
  config.logLevel            = config.logLevel || "debug";
  config.enableTesting       = config.enableTesting;
  config.sslServerKey        = config.sslServerKey;
  config.sslServerCert       = config.sslServerCert;
  config.sslCACert           = config.sslCACert;
  config.enableSSL           = config.enableSSL && config.sslServerKey && config.sslServerCert && config.sslCACert;
  config.enableSSLClientAuth = config.enableSSL && config.enableSSLClientAuth;
  config.behindProxy         = config.behindProxy || false;

  var app = express(), srv;

  if (config.enableSSL) {
    var https = require('https'),
        options = {
          // Specify the key and certificate file
          key: fs.readFileSync(config.sslServerKey),
          cert: fs.readFileSync(config.sslServerCert),
          // Specify the Certificate Authority certificate
          ca: fs.readFileSync(config.sslCACert),

          // This is where the magic happens in Node. All previous steps simply
          // setup SSL (except the CA). By requesting the client provide a
          // certificate, we are essentially authenticating the user.
          requestCert: config.enableSSLClientAuth,

          // If specified as "true", no unauthenticated traffic will make it to
          // the route specified.
          rejectUnauthorized: config.enableSSLClientAuth
        }
    srv = require('https').createServer(options, app);
  } else {
    srv = require('http').createServer(app);
  }

  // express specifically handles the case of sitting behind a proxy, see
  // http://expressjs.com/guide.html#proxies
  if (config.behindProxy) app.enable('trust proxy');

  app.use(express.bodyParser());
  app.use(express.cookieParser());

  // store auth information into a cookie
  app.use(express.cookieSession({
    key: 'livelykernel-sign-on',
    secret: 'foo',
    proxy: config.behindProxy,
    cookie: {path: '/', httpOnly: false, maxAge: null}
  }));

  // -=-=-=-=-=-=-=-=-=-=-=-=-
  // deal with authentication
  // -=-=-=-=-=-=-=-=-=-=-=-=-
  if (config.behindProxy) {
    app.use(auth.extractApacheClientCertHeadersIntoSession);
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // set up logger, proxy and testing routes
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  var logger = log4js.getLogger();
  logger.setLevel((config.logLevel || 'OFF').toUpperCase());
  // FIXME either use log4js or default epxress logger..
  express.logger.token('user', function(req, res) {
      return (req.session && req.session.user) || 'unknown user';
  });
  express.logger.token('email', function(req, res) {
      return (req.session && req.session.email) || '';
  });
  // default format:
  // ':remote-addr - - [:date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
  var fmt = express.logger.default.replace('":method', '":user <:email>" ":method');
  app.use(express.logger(fmt));

  // -=-=-=-=-=-=-
  // Proxy routes
  // -=-=-=-=-=-=-
  var proxyHandler = proxy(logger);
  function extractURLFromProxyRequest(req) {
    // example: /proxy/localhost:5984/test/_all_docs?limit=3
    //       => http://localhost:5984/test/_all_docs?limit=3
    return req.protocol + '://' + req.url.slice('/proxy/'.length);
  }
  app.all(/\/proxy\/(.*)/, function(req, res) {
    var url = extractURLFromProxyRequest(req);
    proxyHandler[req.method.toLowerCase()](url, req, res);
  });

  // -=-=-=-=-=-
  // test server
  // -=-=-=-=-=-
  if (config.enableTesting) { testing(app, logger); };


  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // setup workspace handler / routes
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  new WorkspaceHandler({}, config.srvOptions.node).registerWith(app);

  // -=-=-=-=-=-=-=-
  // setup subserver
  // -=-=-=-=-=-=-=-
  new SubserverHandler({baseURL: '/nodejs/'}).registerWith(app);

  // -=-=-=-=-=-
  // set up DAV
  // -=-=-=-=-=-
  srv.tree = new FsTree(config.srvOptions.node);
  srv.tmpDir = './tmp'; // httpPut writes tmp files
  srv.options = {};
  // for showing dir contents
  srv.plugins = {browser: defaultPlugins.browser};
  // https server has slightly different interface
  if (!srv.baseUri) srv.baseUri = '/';
  if (!srv.getBaseUri) srv.getBaseUri = function() { return this.baseUri };

  function fileHandler(req, res) {
    if (req.url.match(/\?\d+/)) {
      req.url = req.url.replace(/\?.*/, ''); // only the bare file name
    }
    new DavHandler(srv, req, res);
  };

  // DAV routes
  app.all(/.*/, fileHandler);

  // -=-=-=-=-
  // GO GO GO
  // -=-=-=-=-
  srv.listen(config.port);

  return srv;
};
