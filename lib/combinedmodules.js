var fs = require('fs'),
    url = require('url'),
    crypto = require('crypto');

var baseURL = 'core/generated',
    fileName = 'combinedModules';

// -=-=-=-=-=-
// the handler
// -=-=-=-=-=-
function CombinedModulesHandler(cfg) {
  this.config = cfg;
  if (this.config == null) this.config = {};
  this.config.baseURL = this.config.baseURL || baseURL;
  this.config.fileName = this.config.fileName || fileName;

  this.cache = {};
}

CombinedModulesHandler.prototype.registerWith = function(app, server) {
  this.server = server;

  app.get('/' + this.config.baseURL + '/' + this.config.fileName + '.js', this.handleJSRequest.bind(this));
  app.get('/' + this.config.baseURL + '/' + this.config.fileName + 'Hash.txt', this.handleHashRequest.bind(this));
};

CombinedModulesHandler.prototype.handleJSRequest = function(req, res) {
  var urlParts = url.parse(req.originalUrl, false);
  var hash = urlParts.search.substr(1);

  if (this.cache[hash] == null) {
    res.status(500).send('');
  } else {
    var content = this.cache[hash];
    res.set({ 'Content-Type': 'text/plain' });
    res.set('Content-Length', Buffer.byteLength(content));
    if (req.method === 'head')
      res.end();
    else
      res.send(content);
  }
};

CombinedModulesHandler.prototype.handleHashRequest = function(req, res) {
  var err = false;

  // TODO: GENERATE CURRENT CM (?!)
  var hash = generateCombinedModules(this.config.repoPath, this.cache);

  if (err) {
    console.log(err);
    res.status(500).send('');
  } else {
    res.set({ 'Content-Type': 'text/javascript' });
    res.set('Content-Length', hash.length);
    if (req.method === 'head')
      res.end();
    else
      res.send(hash);
  }
};

// -=-=-=-
// helper
// -=-=-=-
var coreModules = [
  // libs:
  'lib/lively-libs-debug.js',
  // bootstrap:
  'lively/Migration.js',
  'lively/JSON.js',
  'lively/lang/Object.js',
  'lively/lang/Function.js',
  'lively/lang/String.js',
  'lively/lang/Array.js',
  'lively/lang/Number.js',
  'lively/lang/Date.js',
  'lively/lang/Worker.js',
  'lively/lang/LocalStorage.js',
  'lively/defaultconfig.js',
  'lively/localconfig.js',
  'lively/Base.js',
  'lively/ModuleSystem.js',
  // additional bootstrap:
  'lively/lang/Closure.js',
  'lively/lang/UUID.js',
  'lively/bindings.js',
  'lively/Main.js',
  // dependencies:
  'lively/persistence/Serializer.js',
  'lively/bindings/Core.js'
];

function generateCombinedModules(repoPath, cache) {
  var rev = null;
  var hashes = Object.getOwnPropertyNames(cache);

  if (didCommitChangeCoreModule(repoPath, rev, coreModules) || (hashes.length == 0)) {
  	console.log('Generating combined modules for ' + repoPath + '...');
  	var combinedSrc = combineCoreModules(repoPath, rev, coreModules);
    var hash = writeCombinedSrc(combinedSrc, cache);
    return hash;
  } else {
    console.log('No changes to ' + repoPath + '!');
    // TODO: (re)store last hash
    return hashes[hashes.length - 1];
  }
}

function didCommitChangeCoreModule(repoPath, rev, modules) {
  return true; // TODO: real test
}

function combineCoreModules(repoPath, rev, modules) {
  var sources = modules.map(function (fileName) {
    return '// contents of ' + fileName + ':\n' +
      readCoreModule(fileName, repoPath) +
      '\n';
  });

  // FIXME patch jQuery - usually done in bootstrap
  sources.splice(1, 0, [
    '(function setupjQuery(Global) {\n' +
    '  var lively = Global.lively,\n' +
    '      jQuery = Global.jQuery;\n' +
    '  // we still are adding jQuery to Global but this is DEPRECATED\n' +
    '  // We need to be able to run with libraries requiring different jQuery versions\n' +
    '  // so we will restrict "our" to lively.$ in the future\n' +
    '  Global.$ = lively.$ = jQuery.noConflict(/*true -- really removes $*/);\n' +
    '})(Global);\n'
  ]);

  sources.unshift('JSLoader.expectToLoadModules(' + JSON.stringify(modules) + ');\n');
  sources.unshift('// This file was generated on ' + (new Date().toLocaleString()) + ' from revision ' + rev + '\n');

  return sources.join('\n');
}

function readCoreModule(fileName, repoPath) {
  try {
    var content = fs.readFileSync(repoPath + '/core/' + fileName);
    return content;
  } catch (e) {
    console.log(e);
    return '// FILE NOT FOUND!';
  }
}

function writeCombinedSrc(src, cache) {
	var md5sum = crypto.createHash('md5');
	md5sum.update(src);
  var hash = md5sum.digest('hex');

  cache[hash] = src;

  return hash;
}

exports.CombinedModulesHandler = CombinedModulesHandler;
