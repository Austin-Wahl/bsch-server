const router = require('express').Router()
const mongoose = require('mongoose')
const User = require('../models/user.model')
const joi = require('joi')
const Clan = require('../models/clan.model')
const {authentication, checkRole, checkBannedStatus} = require('../authentication/middlewares')

router.get('/get-many', async (req, res) => {
    try {
        // Get query parameters
        let search = req.query.search || '';
        let joinedClansQuery = req.query.joinedClans || '';
        let discordIdQuery = req.query.discordIds || '';
        let objectIdQuery = req.query.userIds || '';
        let roleQuery = req.query.role || ''

        if(typeof search == "object" || typeof joinedClansQuery == "object" || typeof discordIdQuery == "object" || typeof objectIdQuery == "object" || typeof roleQuery == "object") {
            return res.status(409).json({
                message: "Couldn't process request due to one or more duplicate query parameters"
            })
        }
        // Initialize query conditions
        let queryConditions = [];

        // Create regex for search if provided
        if (search) {
            const searchArray = search.split(',').map(s => new RegExp(s.trim(), 'i')).filter(regex => regex);
            queryConditions.push({ $or: searchArray.map(regex => ({ username: { $regex: regex } })) })
        }

        // Create regex for joined_clans search if provided
        if (joinedClansQuery) {
            let joinedClansArray = joinedClansQuery.split(',').map(clan => clan.trim());
            const regexJoinedClansArray = joinedClansArray.map(clan => new RegExp(clan, 'i'));

            // Build an array of conditions for the clan search
            const orConditions = joinedClansArray.map(clan => {
                if (mongoose.Types.ObjectId.isValid(clan)) {
                    return { _id: new mongoose.Types.ObjectId(clan) };
                } else {
                    return { 
                        $or: [
                            { name: { $regex: new RegExp(clan, 'i') } },
                            { tag: { $regex: new RegExp(clan, 'i') } }
                        ]
                    };
                }
            });

            const matchingClans = await Clan.find({
                $or: orConditions
            });
            const matchingClanIds = matchingClans.map(clan => clan._id);            
            if(matchingClanIds.length < joinedClansQuery.split(',').filter(value => value).length) {
                return res.status(200).json({
                    users: []
                })
            }
            if (matchingClanIds.length > 0) {
                queryConditions.push({ joined_clans: { $in: matchingClanIds } });
            }
        }

        // Create a query for discord ids if provided
        if(discordIdQuery) {
            let discordIdsArray = discordIdQuery.split(',').filter(id => id).map(id => id.trim());
            
            if(discordIdsArray.length > 0) {
                queryConditions.push({
                    discord_id: {
                        $in: discordIdsArray
                    }
                })
            }
        }

        // Create a query for user ids (object Ids) if provided
        if(objectIdQuery) {
            let objectIdQueryArray = objectIdQuery.split(',').filter(id => id).map(id => id.trim());
            objectIdQueryArray = objectIdQueryArray.filter(id => {
                return mongoose.isValidObjectId(id);
            });
           
            if(objectIdQueryArray.length > 0) {
                queryConditions.push({
                    _id: {
                        $in: objectIdQueryArray
                    }
                })
            }
        }

        if(roleQuery) {
            let roleQueryArray = roleQuery.split(',').filter(role => role).map(role => role.trim())
            if(roleQueryArray.length > 0) {
                queryConditions.push({
                    role: {
                        $in: roleQueryArray
                    }
                })
            }
        }
        // If no query conditions are provided, return all users
        let users;
        if (queryConditions.length > 0) {
            users = await User.find({ $and: queryConditions }).select('-__v').populate({
                path: 'joined_clans',
                select: '-__v'
            });
        } else {
            users = await User.find().select('-__v').populate({
                path: 'joined_clans',
                select: '-__v'
            });
        }
        
        if(users.length < 1) {
            return res.status(404).json({
                message: "Users not found"
            })
        }

        // filter out privated social accounts
        for(let index = 0; index < users.length; index++) {
            let socials = users[index].socials
            users[index].socials = socials.filter(social => social.public);
        }

        return res.status(200).json({
            users
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})
router.get('/get/:discord_id?', async (req, res) => {
    try {
        let discord_id = req.params.discord_id

        if(!discord_id || discord_id.trim() == "") {
            return res.status(400).json({
                message:  "Missing or invalid 'discord_id' parameter"
            })
        }

        let result = (await User.find({}, {__v: 0, }).where("discord_id").equals(discord_id).populate({
            path: 'joined_clans',
            select: '-__v' 
        }))

        if(result.length < 1) {
            return res.status(404).json({
                message: "User not found"
            })
        }

        // filter out privated social accounts
        let socials = result[0].socials 
        result[0].socials = socials.filter(social => social.public);

        return res.status(200).json(result[0])
    } catch (error) {
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})

router.use(authentication)
router.use(checkBannedStatus)

router.post('/create', checkRole("admin"), async (req, res) => {
    try {

        // validation schemas
        const SocialMediaSchema = joi.object({
            platform: joi.string().required(),
            platform_profile_link: joi.string().uri({ scheme: ['http', 'https'] }).required(),
            platform_logo: joi.string().uri({ scheme: ['http', 'https'] }).required(),
            public: joi.boolean().default(false)
        });

        const createUserValidationSchema = joi.object({
            discord_id: joi.string()
                .min(17)
                .max(18)
                .required(),
            username: joi.string()
                .min(2)
                .max(32)
                .required(),
            role: joi.string()
                .default("user")
                .valid('user', 'challenge currator', 'challenge currator lead', 'moderator', 'admin'),
            avatar: joi.string()
                .uri({ scheme: ['http', 'https'] }),
            bio: joi.string()
                .default("")
                .max(1000),
            socials: joi.array()
                .items(SocialMediaSchema)
                .unique((a, b) => a.platform === b.platform) // Ensure platform names are unique
                .max(10),
            joined_clans: joi.array()
                .items(
                    joi.string()
                    .custom((value, helper) => {
                        if (!mongoose.isValidObjectId(value)) {
                            return helper.message(`"joined_clans" user: "${value}" must be a valid Mongoose.ObjectId`);
                        }
                    })
                )
                .sparse()
        })

        let requestBody = req.body
        requestBody.joined_clans = [...new Set(requestBody.joined_clans)]

        // sanitize 
        if(requestBody.discord_id) requestBody.discord_id = requestBody.discord_id.trim()
        if(requestBody.username) requestBody.username = requestBody.username.trim()
        if(requestBody.role) requestBody.role = requestBody.role.trim()
        if(requestBody.avatar) requestBody.avatar = requestBody.avatar.trim()
        if (requestBody.socials) {
            requestBody.socials.forEach(social => {
                social.platform = social.platform.trim();
                social.platform_profile_link = social.platform_profile_link.trim();
                social.platform_logo = social.platform_logo.trim();
            });
        }
            
        // run validation. Yes, mongoose validates but this is another layer because I can
        const validatedResponseError = createUserValidationSchema.validate(requestBody).error
        if(validatedResponseError) {
            return res.status(400).json({
                message: validatedResponseError.details[0].message,
                origianl_request_body: requestBody
            })
        }

        let result = await User.find().where("discord_id").equals(requestBody.discord_id)
        if(result.length > 0) {
            return res.status(409).json({
                message: "User already exists",
                origianl_request_body: requestBody
            })
        }

        const user = new User(requestBody)
        await user.save()

        let userRecord = (await User.find({}, {__v: 0, }).where("discord_id").equals(requestBody.discord_id).populate({
            path: 'joined_clans',
            select: '-__v' 
        }))

        return res.status(200).json(userRecord[0])
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})
router.patch('/update/:discord_id?', async (req, res) => {
    try {
        let discord_id = req.params.discord_id;
        if (!discord_id || discord_id.trim() === "") {
            return res.status(400).json({
                message: "Missing or invalid 'discord_id' parameter"
            });
        }

        let userRole = await User.getRole(req.user.discordId);

        // Check if the logged-in user is allowed to edit the requested user
        if (req.user.discordId !== discord_id) {
            let targetUserRole = await User.getRole(discord_id);
            let isMod = userRole === "moderator";
            let isAdmin = userRole === "admin";

            if (!isMod && !isAdmin && req.user.discordId !== process.env.developer_discord_id) {
                return res.status(403).json({
                    message: "You do not have access to edit this account"
                });
            }

            if ((isMod && (targetUserRole === "moderator" || targetUserRole === "admin")) || 
                (isAdmin && targetUserRole === "admin") && req.user.discordId !== process.env.developer_discord_id) {
                return res.status(403).json({
                    message: "You do not have access to edit this account"
                });
            }
        }

        let user = await User.findOne({ discord_id }, { __v: 0 });

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        // Validation schemas
        const editSocialMediaSchema = joi.object({
            platform: joi.string().required(),
            platform_profile_link: joi.string().uri({ scheme: ['http', 'https'] }).required(),
            platform_logo: joi.string().uri({ scheme: ['http', 'https'] }).required(),
            public: joi.boolean().default(false),
        });

        const editUserValidationSchema = joi.object({
            username: joi.string().min(2).max(32).optional(),
            avatar: joi.string().uri({ scheme: ['http', 'https'] }),
            role: joi.string().valid('user', 'challenge currator', 'challenge currator lead', 'moderator', 'admin'),
            bio: joi.string().max(1000),
            socials: joi.array().items(editSocialMediaSchema).max(10),
            remove_socials: joi.array().items(joi.string()).optional(),
            joined_clans: joi.array().items(
                joi.string()
                .custom((value, helper) => {
                    if (!mongoose.isValidObjectId(value)) {
                        return helper.message(`"joined_clans" user: "${value}" must be a valid Mongoose.ObjectId`);
                    }
                })
            ).optional(),
            remove_joined_clans: joi.array().items(
                joi.string()
                
                .custom((value, helper) => {
                    if (!mongoose.isValidObjectId(value)) {
                        return helper.message(`"remove_joined_clans" user: "${value}" must be a valid Mongoose.ObjectId`);
                    }
                })
            ).optional()
        });

        let requestBody = req.body;
        if (!requestBody || Object.keys(requestBody).length === 0) {
            return res.status(400).json({
                message: "Request body cannot be empty"
            });
        }

        let ppcm = await preventPermissionsCheckmate(req.user.discordId, discord_id);
        if (ppcm) {
            return res.status(403).json(ppcm);
        }
        // sanitize 
        if(requestBody.discord_id) requestBody.discord_id = requestBody.discord_id.trim()
            if(requestBody.username) requestBody.username = requestBody.username.trim()
            if(requestBody.role) requestBody.role = requestBody.role.trim()
            if(requestBody.avatar) requestBody.avatar = requestBody.avatar.trim()
            if (requestBody.socials) {
                requestBody.socials.forEach(social => {
                    social.platform = social.platform.trim();
                    social.platform_profile_link = social.platform_profile_link.trim();
                    social.platform_logo = social.platform_logo.trim();
                });
        
            }
            if (requestBody.remove_socials) {
                requestBody.remove_socials.forEach(remove => {
                   remove = remove.trim()
                });
            }
        const { error } = editUserValidationSchema.validate(requestBody);
        if (error) {
            return res.status(400).json({
                message: error.details[0].message,
                original_request_body: requestBody
            });
        }

        if (!requestBody.remove_socials) requestBody.remove_socials = [];
        let remove_socials_count = user.socials.filter(social => requestBody.remove_socials.includes(social.platform)).length;

        if (requestBody.joined_clans) {
            requestBody.joined_clans = [...new Set(requestBody.joined_clans)];
        }

        if (requestBody.socials && ((user.socials.length - remove_socials_count) + requestBody.socials.length > 10)) {
            return res.status(400).json({
                message: "Failed because the maximum number of 10 social accounts has been reached.",
                original_request_body: requestBody
            });
        }

        if (requestBody.joined_clans && Array.isArray(requestBody.joined_clans) && requestBody.joined_clans.length > 0) {
            await User.updateOne(
                { discord_id },
                { $addToSet: { joined_clans: { $each: requestBody.joined_clans } } }
            );
            delete requestBody.joined_clans;
        }

        if (requestBody.remove_joined_clans && Array.isArray(requestBody.remove_joined_clans) && requestBody.remove_joined_clans.length > 0) {
            await User.updateOne(
                { discord_id },
                { $pull: { joined_clans: { $in: requestBody.remove_joined_clans } } }
            );
            delete requestBody.remove_joined_clans;
        }

        if (requestBody.remove_socials && Array.isArray(requestBody.remove_socials) && requestBody.remove_socials.length > 0) {
            await User.updateOne(
                { discord_id },
                { $pull: { socials: { platform: { $in: requestBody.remove_socials } } } }
            );
        }
        delete requestBody.remove_socials;

        if (requestBody.socials && Array.isArray(requestBody.socials) && requestBody.socials.length > 0) {
            await User.updateOne(
                { discord_id },
                { $addToSet: { socials: { $each: requestBody.socials } } }
            );
            delete requestBody.socials;
        }

        let updateQuery = {};
        if (requestBody.username) updateQuery.username = requestBody.username;
        if (requestBody.avatar) updateQuery.avatar = requestBody.avatar;
        if (requestBody.bio) updateQuery.bio = requestBody.bio;

        let roleMap = {
            "user": 0,
            "challenge currator": 1,
            "challenge currator lead": 2,
            "moderator": 3,
            "admin": 4
        };

        if (requestBody.role) {
            if (!["moderator", "admin"].includes(userRole) && req.user.discordId !== process.env.developer_discord_id) {
                return res.status(403).json({ message: 'Access denied. You do not have the required permissions to change roles.' });
            }
            let requestingUserRole = await User.getRole(req.user.discordId);
            if (roleMap[requestingUserRole] < roleMap[requestBody.role] && req.user.discordId !== process.env.developer_discord_id) {
                return res.status(403).json({ message: 'Access denied. You do not have the required permissions.' });
            }
            updateQuery.role = requestBody.role;
        }

        user = await User.updateOne({ discord_id }, { $set: updateQuery });

        // Fetch the updated user document
        user = await User.findOne({ discord_id }, { __v: 0 }).populate({
            path: 'joined_clans',
            select: '-__v'
        });

        return res.status(200).json(user);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Some sort of internal server error has occurred!",
            original_request_body: req.body
        });
    }
});
router.delete('/delete/:discord_id?', async (req, res) => {
    try {
        let discord_id = req.params.discord_id

        if(!discord_id || discord_id.trim() === "") {
            return res.status(400).json({
                message:  "Missing or invalid 'discord_id' parameter"
            })
        }

        let result = (await User.find({}, {__v: 0, }).where("discord_id").equals(discord_id))
        if(result.length < 1) {
            return res.status(404).json({
                message: "User not found"
            })
        }

        // Fetch the role of the requesting user
        let userRole = await User.getRole(req.user.discordId);

        // Check if the logged-in user is allowed to delete the requested user
        if (req.user.discordId !== discord_id) {
            let targetUserRole = await User.getRole(discord_id);
            let isMod = userRole === "moderator";
            let isAdmin = userRole === "admin";

            // Only the developer or higher roles can delete other users accounts
            if (!["moderator", "admin"].includes(userRole) && req.user.discordId !== process.env.developer_discord_id) {
                return res.status(403).json({
                    message: "You do not have access to delete this account"
                });
            }

            // Mods can't delete admins, mods can't delete mods, and admins can't delete admins
            if ((isMod && (targetUserRole === "moderator" || targetUserRole === "admin")) || 
                (isAdmin && targetUserRole === "admin") && req.user.discordId != process.env.developer_discord_id) {
                return res.status(403).json({
                    message: "You do not have access to delete this account"
                });
            }
        }        
        
        let deleteResponse = await User.deleteOne({ discord_id })

        if(deleteResponse.acknowledged != true || deleteResponse.deletedCount <= 0) {
            return res.status(500).json({
                message: "Failed to delete user"
            })
        }

        return res.status(200).json({
            message: "User deleted successfully"
        })
    } catch (error) {
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})
router.put('/ban/:discord_id?', async (req, res) => {
    try {
        let discord_id = req.params.discord_id

        if(!discord_id || discord_id.trim() === "") {
            return res.status(400).json({
                message:  "Missing or invalid 'discord_id' parameter"
            })
        }

        let result = (await User.find({}, {__v: 0, }).where("discord_id").equals(discord_id))
        if(result.length < 1) {
            return res.status(404).json({
                message: "User not found"
            })
        }

        if(req.user.discordId == discord_id) {
            return res.status(403).json({
                message: "You can not ban your own account"
            })
        }
        // Fetch the role of the requesting user
        let userRole = await User.getRole(req.user.discordId);

        // Check if the logged-in user is allowed to delete the requested user
        let targetUserRole = await User.getRole(discord_id);
        let isMod = userRole === "moderator";
        let isAdmin = userRole === "admin";

        // Only the developer or higher roles can delete other users accounts
        if (!["moderator", "admin"].includes(userRole) && req.user.discordId !== process.env.developer_discord_id) {
            return res.status(403).json({
                message: "You do not have access to ban this account"
            });
        }

        // Mods can't delete admins, mods can't delete mods, and admins can't delete admins
        if ((isMod && (targetUserRole === "moderator" || targetUserRole === "admin")) || 
            (isAdmin && targetUserRole === "admin") && req.user.discordId != process.env.developer_discord_id) {
            return res.status(403).json({
                message: "You do not have access to ban this account"
            });
        }
        
        let banResponse = await User.updateOne({ discord_id }, { $set: { banned: true }})

        if(banResponse.acknowledged != true || banResponse.deletedCount <= 0) {
            return res.status(500).json({
                message: "Failed to ban user"
            })
        }

        return res.status(200).json({
            message: "User banned successfully"
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})
router.put('/unban/:discord_id?', async (req, res) => {
    try {
        let discord_id = req.params.discord_id

        if(!discord_id || discord_id.trim() === "") {
            return res.status(400).json({
                message:  "Missing or invalid 'discord_id' parameter"
            })
        }

        let result = (await User.find({}, {__v: 0, }).where("discord_id").equals(discord_id))
        if(result.length < 1) {
            return res.status(404).json({
                message: "User not found"
            })
        }

        if(req.user.discordId == discord_id) {
            return res.status(403).json({
                message: "You can not unban your own account"
            })
        }
        // Fetch the role of the requesting user
        let userRole = await User.getRole(req.user.discordId);

        // Check if the logged-in user is allowed to delete the requested user
        let targetUserRole = await User.getRole(discord_id);
        let isMod = userRole === "moderator";
        let isAdmin = userRole === "admin";

        // Only the developer or higher roles can delete other users accounts
        if (!["moderator", "admin"].includes(userRole) && req.user.discordId !== process.env.developer_discord_id) {
            return res.status(403).json({
                message: "You do not have access to unban this account"
            });
        }

        // Mods can't delete admins, mods can't delete mods, and admins can't delete admins
        if ((isMod && (targetUserRole === "moderator" || targetUserRole === "admin")) || 
            (isAdmin && targetUserRole === "admin") && req.user.discordId != process.env.developer_discord_id) {
            return res.status(403).json({
                message: "You do not have access to unban this account"
            });
        }
        
        let banResponse = await User.updateOne({ discord_id }, { $set: { banned: false }})

        if(banResponse.acknowledged != true || banResponse.deletedCount <= 0) {
            return res.status(500).json({
                message: "Failed to unban user"
            })
        }

        return res.status(200).json({
            message: "User unbanned successfully"
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})
router.get('/@me', async (req, res) => {
    try {
        const discordAuthToken = req.user.discordId
        
        if(!discordAuthToken) {
            return res.status(401).json({
                message: "Unauathorized"
            })
        }

        let result = (await User.find({}, {__v: 0, }).where("discord_id").equals(discordAuthToken).populate({
            path: 'joined_clans',
            select: '-__v' 
          }))
        
          // this shouldn't ever run but incase
        if(result.length < 1) {
            return res.status(404).json({
                message: "User not found"
            })
        }

        return res.status(200).json(result[0])
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})

async function preventPermissionsCheckmate(loggedInUser, userBeingEdited) {
    let loggedInUserRole = await User.getRole(loggedInUser);
    let userBeingEditedRole = await User.getRole(userBeingEdited);

    if (loggedInUser !== userBeingEdited && loggedInUserRole !== "moderator" && loggedInUserRole !== "admin" && loggedInUser !== process.env.developer_discord_id) {
        return { message: "You do not have access to edit this account" };
    }
    if (loggedInUserRole !== "admin" && userBeingEditedRole === "admin" && loggedInUser !== process.env.developer_discord_id) {
        return { message: "You do not have access to edit this account" };
    }
    if (userBeingEditedRole === loggedInUserRole && loggedInUser !== userBeingEdited && loggedInUser !== process.env.developer_discord_id) {
        return { message: "You do not have access to edit this account" };
    }
    return undefined;
}

module.exports = router