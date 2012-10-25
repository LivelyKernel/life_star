/*global exports, require, JSON, __dirname, console*/

// continously run with:
// nodemon nodeunit tests/workspace-test.js

var testHelper = require('./test-helper'),
    http = require('http'),
    lifeStarTest = require("./life_star-test"),
    testSuite = {},
    fs = require('fs');

var tempFiles = [], tempDirs = [];
function createTempFile(filename, content) {
    fs.writeFileSync(filename, content);
    tempFiles.push(filename);
    console.log('created ' + filename);
}

function cleanupTempFiles() {
    tempFiles.forEach(function(file) {
        fs.unlinkSync(file);
    });
    tempFiles = [];
}

testSuite.SubserverTest = {

    setUp: function(run) {
        run();
    },

    tearDown: function(run) {
        cleanupTempFiles();
        lifeStarTest.shutDownLifeStar(run);
    },

    "life star is running": function(test) {
        lifeStarTest.withLifeStarDo(test, function() {
            http.get('http://localhost:9999/', function(res) {
                test.equals(200, res.statusCode);
                test.done();
            })
        })
    },

    "server placed in subserver dir is started and accessible": function(test) {
        var simpleServerSource = "module.exports = function(baseRoute, app) {\n"
                               + "    app.get(baseRoute, function(req, res) {\n"
                               + "        res.send('hello');\n"
                               + "    });\n"
                               + "}\n";
        createTempFile(__dirname + '/../subservers/foo.js', simpleServerSource);
        lifeStarTest.withLifeStarDo(test, function() {
            http.get('http://localhost:9999/nodejs/foo/', function(res) {
                var data = "";
                res.on('data', function(d) { data += d; })
                res.on('end', function(err) {
                    test.equals('hello', data);
                    test.done();

                })
            });
        })
    }

}

exports.testSuite = testSuite;
