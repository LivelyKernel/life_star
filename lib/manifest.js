 /*global require, module*/

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// manifest files are used by web browsers for cacheing see
// http://appcachefacts.info/ and
// http://www.alistapart.com/articles/application-cache-is-a-douchebag/ for
// more info
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

var exec = require('child_process').exec,
    manifestFileName = "lively.appcache",
    headers = {
      'Content-Type': 'text/cache-manifest',
      'Cache-Control': 'no-cache, private'
    },
    config, lastFileModificationTime, manifestContent;

// -=-=-=-
// helper
// -=-=-=-
function findJSFilesForManifest(rootDir, thenDo) {
  // find all js files
  // ignore .git and node_modules dirs
  var cmd = 'find .'
          + ' \\( -name node_modules -or -name .git \\)'
          + ' -type d -prune -o -iname "*.js"'
          + ' -print';
  exec(cmd, {cwd: rootDir}, function(code, out, err) { thenDo(code, out); });
}

function lastModificationDateOfFilesIn(dir, thenDo) {
  // Find and return recursively the last mod time (in seconds) of the last
  // changed file in dir.
  // NOTE: contrary to the function above we also include html files here.
  // html files are cached implicitly by the browser and we want changes in
  // them to be visible in a browser session as well.
  var cmd = 'find .'
          + ' \\( -name node_modules -o -name .git \\) -type d -prune'
          + ' -o \\( -iname "*.js" -o -iname "*.html" \\)'
          + ' -exec stat -f "%m" {} \\;' // use formt "%m %N" to also get the filename
          + ' | sort -rn'
          + ' | head -1';
  exec(cmd, {cwd: dir}, function(code, out, err) { thenDo(code, out); });
}

function buildManifestFileContents(thenDo) {
  var dir = config.fsNode;
  lastModificationDateOfFilesIn(dir, function(err, lastMod) {
    // 1) check if there are any file modifications
    var shouldGenerate = err
                      || !lastFileModificationTime
                      || lastFileModificationTime !== lastMod
                      || !manifestContent;
    lastFileModificationTime = lastMod;
    // 2) if possible reuse old manifest file
    if (!shouldGenerate) { thenDo(null, manifestContent); return; }
    findJSFilesForManifest(dir, function(err, filesString) {
      // 3) otherwise find all js files and build new manifest
      if (err) { thenDo(err); return; }
      filesString = filesString.replace(/\.\//g, '/');
      manifestContent = "CACHE MANIFEST\n# timestamp " + lastMod + "\n\n"
                      + 'CACHE:\n' + filesString
                      + '\n\nNETWORK:\n'
                      + '*\nhttp://*\nhttps://*\n';
      thenDo(null, manifestContent);
    });
  });
}

function addManifestRefToHTMLSource(sourceOrBuffer) {
  var s = sourceOrBuffer.toString();
    s = s.replace(/<html>/, '<html manifest="/' + manifestFileName + '">');
}

// -=-=-=-=-=-
// the handler
// -=-=-=-=-=-
function ManifestHandler(cfg) {
  config = cfg;
}

ManifestHandler.prototype.registerWith = function(app) {
  // route for serving the manifest file
  if (!config.useManifestCaching) return;
  function handleRequest(req, res) {
    buildManifestFileContents(function(err, contents) {
      if (err) {
        res.status(500).send('');
      } else {
        res.set(headers);
        res.set('Content-Length', contents.length);
        if (req.method === 'head') res.end();
        else res.send(contents);
      }
    });
  }
  app.get('/' + manifestFileName, handleRequest);
  app.head('/' + manifestFileName, handleRequest);
}

// var newId = (function() {
//   var id = 0;
//   return function() { return ++id }
// })();

ManifestHandler.prototype.addManifestRef = function(req, res) {
  // when serving html files this methods rewrites what is send so that the
  // html source includes a ref to the manifest file
  if (!config.useManifestCaching) return;

  // only when reading html files
  if (!(/\.html$/.test(req.url)) || req.method.toLowerCase() !== 'get') return;

  // that's a bit hacky.... we will capture what is send as a response (HTTP
  // code, headers, and body -- can be send in multiple buffers since response
  // acts as a stream) but not actually send the stuff. What we do:
  // 1) when response.end() is called we will look for "<html>" in the content
  // and replace it with an element declaration that includes the manifest
  // attribute.
  // 2) we path the Content-Length Header
  // 3) we send the header, the patched body content, and finish off by
  // calling the original end()
  var interceptedHeaders, interceptedHeadersCode,
      interceptedData = [],
      writeFunc = res.write,
      endFunc = res.end,
      writeHeadFunc = res.writeHead;

  // var id = newId();
  res.writeHead = function(code, headers) {
    // console.log('%s: %s writing code %s and headers %s', id, req.url, code, require('util').inspect(headers));
    interceptedHeadersCode = code;
    interceptedHeaders = headers;
    return this;
  }

  res.write = function(data) {
    var s = data.toString(),
        len = s.length;
    // console.log('%s: %s writing %s chars (%s...%s)', id,
    //             req.url,
    //             len,
    //             s.substring(0, 50),
    //             s.substring(len-50, len));
    interceptedData.push(data);
    return this;
  }

  function addManifestAttributeToResponseBody(buffers) {
    if (buffers.length === 0) return buffers;
    var content = buffers.join(''),
        start = content.indexOf('<html>');
    if (start === -1) return buffers;
    content = content.substring(0, start)
            + '<html manifest="/' + manifestFileName + '">'
            + content.substring(start + 6);
    if (interceptedHeaders) { interceptedHeaders['content-length'] = content.length; }
    return [new Buffer(content)];
  }

  res.end = function(data) {
    // console.log('%s: %s response.end() called with %s', id, req.url, data && data.toString());
    if (data) interceptedData.push(data);
    interceptedData = addManifestAttributeToResponseBody(interceptedData);
    writeHeadFunc.call(this, interceptedHeadersCode, interceptedHeaders);
    interceptedData.forEach(function(buf) { writeFunc.call(res, buf); });
    return endFunc.call(this);
  }
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

exports.ManifestHandler = ManifestHandler;
