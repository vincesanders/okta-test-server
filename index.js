require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const authRouter = require('./auth/authRouter');

const server = express();

server.use(express.json(), cors(), helmet());

/************************* Okta Middleware ***************************/
const session = require('express-session');
const { ExpressOIDC } = require('@okta/oidc-middleware');

// session support is required to use ExpressOIDC
server.use(session({
    secret: 'keep it secret, keep it safe',
    resave: true,
    saveUninitialized: false
}));

const oidc = new ExpressOIDC({
    issuer: process.env.OKTA_ISSUER_URL,
    client_id: process.env.OKTA_CLIENT_ID,
    client_secret: process.env.OKTA_CLIENT_SECRET,
    appBaseUrl: `http://localhost:${process.env.PORT}`,
    redirect_uri: process.env.OKTA_REDIRECT_URI,
    scope: 'openid profile'
});

// ExpressOIDC will attach handlers for the /login and /authorization-code/callback routes
server.use(oidc.router);
/************************* Okta Middleware ***************************/

server.use('/api/auth', authRouter);

const PORT = process.env.PORT || 5000;

server.get('/', (req, res) => {
    res.send({ message: 'Let\'s test Okta!!!' });
});

oidc.on('ready', () => {
    server.listen(PORT, () => {
        console.log(`Listening on port ${PORT}...`);
    });
})

oidc.on('error', err => {
    console.log('Unable to configure ExpressOIDC', err);
});
