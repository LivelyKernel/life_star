/*global module, console, setTimeout*/

var lifeStar = require("./../life_star"),
    server;

function withLifeStarDo(test, func) {
    if (server) test.assert(false, 'life_star already running!')
    server = lifeStar({host: 'localhost', port: 9999});
    server.on('error', function(e) {
        test.ifError(e);
        test.done();
    });
    setTimeout(function() { func(server) }, 500);
}

function shutDownLifeStar(thenDo) {
    if (!server) { thenDo(); return }
    server.close(function() {
        server = null;
        console.log("life_star shutdown");
        thenDo();
    });
}

module.exports = {
    withLifeStarDo: withLifeStarDo,
    shutDownLifeStar: shutDownLifeStar
}