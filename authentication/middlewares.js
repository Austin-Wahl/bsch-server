const User = require('../models/user.model')
const jwt = require('jsonwebtoken')

async function authentication(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : req.cookies.jwt;
        try {
            const decoded = jwt.verify(token, process.env.oauth_jwt_secret);
            const user = await User.findById(decoded.userId);
            if (!user) return res.status(404).json({ message: 'User not found' });
            
            req.user = decoded;
            next();
        } catch (ex) {
            return res.status(400).json({ error: 'Invalid token' });
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
}

const checkRole = (requiredRole) => {
    return async (req, res, next) => {
        try {

            let map = {
                "user": 0,
                "challenge currator": 1,
                "challenge currator lead": 2,
                "moderator": 3,
                "admin": 4
            }

            const user = await User.findById(req.user.userId);
            if (!user) return res.status(404).json({ message: 'User not found' });

            if (req.user.discordId != process.env.developer_discord_id && map[user.role] < map[requiredRole]) {
                return res.status(403).json({ message: 'Access denied. You do not have the required permissions.' });
            }

            next();
        } catch (error) {
            console.log(error)
            return res.status(500).json({
                message: "Some sort of internal server error has occured!"
            })
        }
    };
};

const checkBannedStatus = async (req, res, next) => {
    try {
        let user = await User.findOne({ discord_id: req.user.discordId })
        if(user.banned && req.user.discordId != process.env.developer_discord_id) {
            return res.status(403).json({
                message: "Access denied. This account is banned."
            })
        }
        next()
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
}

module.exports = {
    authentication,
    checkRole,
    checkBannedStatus
}