require('./life_star')({
    host: 'localhost',
    port: 9001,
    fsNode: process.env.LIVELY,
    enableTesting: true,
    logLevel: 'debug'
});
