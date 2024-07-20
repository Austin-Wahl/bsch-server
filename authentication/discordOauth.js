let useSecureCookie = true
if(process.env.production == 'development') 
    useSecureCookie = false

const router = require('express').Router()
const OAuth2 = require('discord-oauth2')
const User = require('../models/user.model')
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken')

// Set up session middleware with MongoStore
router.use(session({
    secret: process.env.session_secret,
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({ mongoUrl: process.env.mongodb_connection }),
    cookie: { secure: useSecureCookie, maxAge: 24 * 60 * 60 * 1000 },
}));

const oauth = new OAuth2({
    clientId: process.env.discord_client_id,
    clientSecret: process.env.discord_client_secret,
    redirectUri: process.env.discord_oauth_redirect,
});

router.get('/login', (req, res) => {
    const authUrl = oauth.generateAuthUrl({
        scope: ['identify', 'guilds'],
    });
    res.redirect(authUrl);
});
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'Failed to logout' });
        }
        res.clearCookie('connect.sid'); // Name of the session cookie
        res.clearCookie('jwt'); // Name of the session cookie
        return res.status(200).json({ message: 'Successfully logged out' });
    });
});

router.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.status(400).json({ error: "Missing oauth grant code" });
    }

    try {
        // Exchange OAuth code for access token
        const tokenRequestParams = {
            code,
            scope: 'identify guilds',
            grantType: 'authorization_code',
        };

        const token = await oauth.tokenRequest(tokenRequestParams);

        // Store tokens in session
        req.session.token = token.access_token;
        req.session.refreshToken = token.refresh_token;
        req.session.expiresAt = Date.now() + (token.expires_in * 1000);

        // Get Discord user information
        let oauthDiscordUser = await oauth.getUser(req.session.token);
        req.session.discord_id = oauthDiscordUser.id;

        // Update or create user in database
        let updatedUser = await User.findOneAndUpdate(
            { discord_id: oauthDiscordUser.id },
            {
                username: oauthDiscordUser.username,
                avatar: `https://cdn.discordapp.com/avatars/${oauthDiscordUser.id}/${oauthDiscordUser.avatar}`
            },
            { new: true, upsert: true }
        );

        // Create JWT for user authentication
        const jwtToken = jwt.sign(
            { userId: updatedUser._id, discordId: updatedUser.discord_id },
            process.env.oauth_jwt_secret,
            { expiresIn: '1h' } // Token expires in 1 hour
        );

        // Set JWT as Authorization header in response
        res.cookie('jwt', jwtToken, { httpOnly: true, secure: process.env.production === 'production' });

        // Return JWT token in response body (optional)
        return res.status(200).json({ token: jwtToken });
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
// router.get('/auth/discord/callback', async (req, res) => {
//     const code = req.query.code;

//     if (!code) {
//         return res.status(400).json({
//             error: "Missing oauth grant code"
//         });
//     }

//     try {
//         const tokenRequestParams = {
//             code,
//             scope: 'identify guilds',
//             grantType: 'authorization_code',
//         };

//         const token = await oauth.tokenRequest(tokenRequestParams);

//         req.session.token = token.access_token;
//         req.session.refreshToken = token.refresh_token;
//         req.session.expiresAt = Date.now() + (token.expires_in * 1000);

//         let oauthDiscordUser = await oauth.getUser(req.session.token);
//         req.session.discord_id = oauthDiscordUser.id;

//         let updatedUser = await User.findOneAndUpdate(
//             { discord_id: oauthDiscordUser.id },
//             {
//                 username: oauthDiscordUser.username,
//                 avatar: `https://cdn.discordapp.com/avatars/${oauthDiscordUser.id}/${oauthDiscordUser.avatar}`
//             },
//             { new: true, upsert: true } // upsert ensures creation if not found
//         );

//         let responseRecord = await User.findOne({ discord_id: updatedUser.discord_id }, { __v: 0 })
//             .populate({
//                 path: 'socials',
//                 select: '-__v'
//             })
//             .populate({
//                 path: 'joined_clans',
//                 select: '-__v'
//             });

//         return res.status(200).json(responseRecord);
//     } catch (error) {
//         console.error('OAuth callback error:', error);
//         res.status(500).json({
//             error: "Internal Server Error"
//         });
//     }
// });

router.get('/profile', async (req, res) => {
    if (!req.session.token) {
        return res.redirect('/login');
    }

    if (Date.now() > req.session.expiresAt) {
        try {
            await refreshAccessToken(req);
        } catch (error) {
            return res.redirect('/login');
        }
    }

    try {
        const user = await oauth.getUser(req.session.token);
        res.json(user);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({
            BeatSaberClanHubError: "Some sort of internal server error has occured!"
        })
    }
});

async function refreshAccessToken(req) {
    if (!req.session.refreshToken) {
        throw new Error('No refresh token available');
    }

    try {
        const refreshedToken = await oauth.tokenRequest({
            refreshToken: req.session.refreshToken,
            grantType: 'refresh_token',
            scope: 'identify guilds',
        });

        req.session.token = refreshedToken.access_token;
        req.session.refreshToken = refreshedToken.refresh_token;
        req.session.expiresAt = Date.now() + (refreshedToken.expires_in * 1000);

        return refreshedToken.access_token;
    } catch (error) {
        console.error('Error refreshing token:', error);
        throw new Error('Unable to refresh token');
    }
}

module.exports = router;