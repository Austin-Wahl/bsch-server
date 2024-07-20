const router = require('express').Router()
const Clan = require('../models/clan.model')
const User = require('../models/user.model')
const joi = require('joi')
const mongoose = require('mongoose')

const {authentication, checkRole, checkBannedStatus} = require('../authentication/middlewares')

router.get('/get/:clan_id?', async (req, res) => {
    try {
        let clan_id = req.params.clan_id;

        if (!clan_id || clan_id.trim() === "" || !mongoose.isValidObjectId(clan_id)) {
            return res.status(400).json({
                message: "Missing or invalid 'clan_id' parameter"
            });
        }

        let result = await Clan.find({}, {__v:0}).where('_id').equals(clan_id).populate({
            path: "owners members positive_ratings negative_ratings",
            select: "-__v -__v -joined_clans"
        })

        if(result.length < 1) {
            return res.status(404).json({
                message: "Clan not found"
            })
        }

        return res.status(200).json(result[0])
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})
router.get('/get-many', async (req, res) => {
    try {
        // names
        let nameQuery = req.query.name || ''
        let tagQuery = req.query.tag || ''
        let clanIdQuery = req.query.clanId || ''
        let ownerQuery = req.query.owner || ''
        let categoryQuery = req.query.category || ''
        let bschApprovedQuery = req.query.approved || false
        let memberCountQuery = req.query.memberCount || ''
        let possitiveRatingQuery = req.query.possitiveRating || ''
        let negativeRatingQuery = req.query.negativeRating || ''

        if(typeof nameQuery == 'object' || typeof tagQuery == 'object' || typeof clanIdQuery == 'object' || typeof ownerQuery == 'object'
            || typeof categoryQuery == 'object' || typeof bschApprovedQuery == 'object' || typeof memberCountQuery == 'object' || typeof possitiveRatingQuery == 'object' || typeof negativeRatingQuery == 'object'
        ) {
            return res.status(409).json({
                message: "Couldn't process request due to one or more duplicate query parameters"
            }) 
        }
        
        let queryConditions = []

        if(nameQuery) {
            const nameArray = nameQuery.split(',').map(name => new RegExp(name.trim(), 'i')).filter(name => name)
            queryConditions.push({ 
                name: {
                    $in: nameArray
                }
            })
        }
        if(tagQuery) {
            const tagArray = tagQuery.split(',').map(tag => new RegExp(tag.trim(), 'i')).filter(tag => tag)
            queryConditions.push({ 
                tag: {
                    $in: tagArray
                }
            })
        }
        if(clanIdQuery) {
            const clanIdQueryArray = clanIdQuery.split(',').filter(id => id).map(id => id.trim())
            clanIdQueryArray.filter(id => {
                return mongoose.isValidObjectId(id)
            })

            if(clanIdQueryArray.length > 0) {
                queryConditions.push({
                    _id: {
                        $in: clanIdQueryArray
                    }
                })
            }        
        }
        if(ownerQuery) {
            const ownerIdQueryArray = ownerIdQuery.split(',').filter(id => id).map(id => id.trim())
            ownerIdQueryArray.filter(id => {
                return mongoose.isValidObjectId(id)
            })

            if(ownerIdQueryArray.length > 0) {
                queryConditions.push({
                    _id: {
                        $in: ownerIdQueryArray
                    }
                })
            }     
        }
        if(categoryQuery) {
            const categoryQueryArray = categoryQuery.split(',').map(category => new RegExp(category.trim(), 'i')).filter(category => category)
            queryConditions.push({ 
                categories: {
                    $in: categoryQueryArray
                }
            })
        }
        if(JSON.parse(bschApprovedQuery) && typeof JSON.parse(bschApprovedQuery) == 'boolean') {
            console.log(bschApprovedQuery)
            queryConditions.push({ 
                bsch_approved: bschApprovedQuery
            })
        }
        let clans;
        if (queryConditions.length > 0) {
            clans = await Clan.find({ $and: queryConditions }).select('-__v').populate({
                path: 'owners members positive_ratings negative_ratings',
                select: '-__v -__v -joined_clans'
            });
        } else {
            clans = await Clan.find().select('-__v').populate({
                path: 'owners members positive_ratings negative_ratings',
                select: '-__v -__v -joined_clans'
            });
        }

        if(clans.length < 1) {
            return res.status(404).json({
                message: "No clans found"
            })
        }
        return res.status(200).json({clans})
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})

router.use(authentication)
router.use(checkBannedStatus)

router.post('/create', async (req, res) => {
    try {
        let requestBody = req.body;
        delete requestBody.members;
        
        const SocialMediaSchema = joi.object({
            platform: joi.string().required(),
            platform_profile_link: joi.string().uri({ scheme: ['http', 'https'] }).required(),
            platform_logo: joi.string().uri({ scheme: ['http', 'https'] }).required(),
        });

        const clanSchema = joi.object({
            name: joi.string().required(),
            tag: joi.string().min(2).max(6).required(),
            description: joi.string().max(1000),
            logo: joi.string().uri({ scheme: ['http', 'https'] }),
            owners: joi.array()
                .items(
                    joi.string().custom((value, helper) => {
                        if (!mongoose.isValidObjectId(value)) {
                            return helper.message(`"owners": "${value}" must be a valid Mongoose.ObjectId`);
                        }
                    })
                )
                .min(1)
                .sparse(true)
                .required(),
            socials: joi.array()
                .items(SocialMediaSchema)
                .unique((a, b) => a.platform === b.platform) // Ensure platform names are unique
                .max(10),
            categories: joi.array().items(joi.valid('acc', 'speed', 'challenge', 'ranked', 'fun', 'tech', 'everything')),
            members: joi.array()
                .items(
                    joi.string().custom((value, helper) => {
                        if (!mongoose.isValidObjectId(value)) {
                            return helper.message(`"members": "${value}" must be a valid Mongoose.ObjectId`);
                        }
                    })
                )
                .sparse()
                .required()
        });
        
        // sanatize 
        if(requestBody.name) requestBody.name = requestBody.name.trim()
        if(requestBody.tag) requestBody.tag = requestBody.tag.trim()
        if(requestBody.logo) requestBody.logo = requestBody.logo.trim()
        if (requestBody.categories) {
            requestBody.categories.forEach(category => {
                category = category.trim();
            });
        }
        if (requestBody.socials) {
            requestBody.socials.forEach(social => {
                social.platform = social.platform.trim();
                social.platform_profile_link = social.platform_profile_link.trim();
                social.platform_logo = social.platform_logo.trim();
            });
        }
    // The requesting user is assigned as an owner. This is not something that can be overridden.
        if (requestBody.owners) {
            requestBody.owners.push(req.user.userId);
            requestBody.owners = [...new Set(requestBody.owners)];
            requestBody.members = [...new Set(requestBody.owners)];
        } else {
            requestBody.owners = [req.user.userId];
            requestBody.members = [req.user.userId];
        }

        if (requestBody.categories) {
            requestBody.categories = [...new Set(requestBody.categories)];
        }

        const { error } = clanSchema.validate(requestBody);
        if (error) {
            return res.status(400).json({
                message: error.details[0].message,
                original_request_body: requestBody
            });
        }

        // Make sure all owners are present in BSCH db
        let validateOwners = await User.find({
            _id: { $in: requestBody.owners }
        }, { _id: 1 });

        if (validateOwners.length < requestBody.owners.length) {
            return res.status(404).json({
                message: "One or more owners is not registered with BSCH"
            });
        }

        requestBody.created_by = req.user.userId;

        // Check to make sure user does not have more than 3 clans
        let existingClansCount = await Clan.countDocuments({ created_by: requestBody.created_by });
        if (existingClansCount >= 3) {
            return res.status(409).json({
                message: "This account has already registered 3 clans"
            });
        }

        // Check for duplicate clan name and tag
        let duplicateClan = await Clan.findOne({
            name: requestBody.name,
            tag: requestBody.tag
        }, { _id: 1 });

        if (duplicateClan) {
            return res.status(409).json({
                message: `A clan already exists with name \"${requestBody.name}\" and tag \"${requestBody.tag}\"`
            });
        }

        // Create and save the new clan
        let clan = new Clan(requestBody);
        clan = await clan.save();

        // Return the created clan without the __v field, and populate owners, members, and created_by
        const savedClan = await Clan.findOne({ _id: clan._id }, { __v: 0 }).populate({
            path: 'owners members created_by',
            select: '-__v -joined_clans'
        });

        return res.status(200).json(savedClan);
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Some sort of internal server error has occurred!"
        });
    }
});
router.patch('/update/:clan_id?', async (req, res) => {
    try {
        let clan_id = req.params.clan_id
        if (!clan_id || clan_id.trim() === "" || !mongoose.isValidObjectId(clan_id)) {
            return res.status(400).json({
                message: "Missing or invalid 'clan_id' parameter"
            });
        }

        let requestBody = req.body
        delete requestBody.members

        const SocialMediaSchema = joi.object({
            platform: joi.string().required(),
            platform_profile_link: joi.string().uri({ scheme: ['http', 'https'] }).required(),
            platform_logo: joi.string().uri({ scheme: ['http', 'https'] }).required(),
        });

        const clanSchema = joi.object({
            name: joi.string(),
            tag: joi.string()
                .min(2)
                .max(6),
            description: joi.string()
                .max(1000),
            logo: joi.string()
                .uri({ scheme: ['http', 'https'] }),
            owners: joi.array()
                .items(
                    joi.string()
                        .custom((value, helper) => {
                            if (!mongoose.isValidObjectId(value)) {
                            return helper.message(`"owners": "${value}" must be a valid Mongoose.ObjectId`);
                            }
                        })
                )
                .min(1)
                .sparse(true),
            remove_owners: joi.array()
                .items(
                    joi.string()
                        .custom((value, helper) => {
                            if (!mongoose.isValidObjectId(value)) {
                            return helper.message(`"remove_owners": "${value}" must be a valid Mongoose.ObjectId`);
                            }
                        })
                )
                .sparse(true),
            socials: joi.array()
                .items(SocialMediaSchema)
                .unique((a, b) => a.platform === b.platform) // Ensure platform names are unique
                .max(10),
            remove_socials: joi.array()
                .items(joi.object({
                    platform_name: joi.string().required(),
                    platform_profile_link: joi.string().uri({ scheme: ['http', 'https'] }).required(),
                })),
            categories: joi.array()
                .items(joi.valid('acc', 'speed', 'challenge', 'ranked', 'fun', 'tech', 'everything')),
            remove_categories: joi.array()
                .items(joi.valid('acc', 'speed', 'challenge', 'ranked', 'fun', 'tech', 'everything')),
            members: joi.array()
                .items(
                    joi.string()
                    .custom((value, helper) => {
                        if(!mongoose.isValidObjectId(value)) {
                            return helper.message(`"members": "${value}" must be a valid Mongoose.ObjectId`)
                        }
                    })
                )
                .sparse()
        })

        // check user permissions 
        // moderators, admin, clan owners are the only people who can edit a clan
        let userRole = await User.getRole(req.user.discordId)
        let clan = await Clan.findOne({_id: clan_id})
        
        if(!clan) {
            return res.status(404).json({
                message: 'Clan not found'
            })
        }
        let isClanOwner = clan.owners.includes(req.user.userId)
        let isClanCreator = clan.created_by == req.user.userId

        if(!['moderator', 'admin'].includes(userRole) && !isClanOwner && req.user.discordId !== process.env.developer_discord_id) {
            return res.status(403).json({
                message: "You do not have permissions to edit this clan",
                origianl_request_body: requestBody
            });
        }        
        // only mods, admin , and clan CREATOR can remove owners
        if((!['moderator', 'admin'].includes(userRole) || (isClanOwner && !isClanCreator) || req.user.discordId != process.env.developer_discord_id) && requestBody.remove_owners) {
            return res.status(403).json({
                message: "You do not have permissions to remove owners from this clan",
                origianl_request_body: requestBody
            })
        }

        const {error} = clanSchema.validate(requestBody)
        if(error) {
            return res.status(400).json({
                message: error.details[0].message,
                origianl_request_body: requestBody
            })
        }

        // if clan owner attempts to remove themselves, throw a conflict error (ownership must be transfered)
        if(requestBody.remove_clan_owners) {
            if(requestBody.remove_clan_owners.includes(req.user.userId)) {
                return res.status(409).json({
                    message: "You must transfer ownership to remove yourself as a clan leader",
                    origianl_request_body: requestBody
                })
            }
        }
        // sanatize 
        if(requestBody.name) requestBody.name = requestBody.name.trim()
        if(requestBody.tag) requestBody.tag = requestBody.tag.trim()
        if(requestBody.logo) requestBody.logo = requestBody.logo.trim()
        if (requestBody.categories) {
            requestBody.categories.forEach(category => {
                category = category.trim();
            });
        }
        if (requestBody.socials) {
            requestBody.socials.forEach(social => {
                social.platform = social.platform.trim();
                social.platform_profile_link = social.platform_profile_link.trim();
                social.platform_logo = social.platform_logo.trim();
            });
        }

        if (!requestBody.remove_socials) requestBody.remove_socials = [];
        let remove_socials_count = clan.socials.filter(social => requestBody.remove_socials.includes(social.platform)).length;

        if (requestBody.joined_clans) {
            requestBody.joined_clans = [...new Set(requestBody.joined_clans)];
        }

        if (requestBody.socials && ((clan.socials.length - remove_socials_count) + requestBody.socials.length > 10)) {
            return res.status(400).json({
                message: "Failed because the maximum number of 10 social accounts has been reached.",
                original_request_body: requestBody
            });
        }

        // add owenrs
        if (requestBody.owners && Array.isArray(requestBody.owners) && requestBody.owners.length > 0) {
            await Clan.updateOne(
                { _id: clan_id },
                { $addToSet: { owners: { $each: requestBody.owners } } }
            );
            delete requestBody.joined_clans;
        }
        // remove owners
        if (requestBody.remove_owners && Array.isArray(requestBody.remove_owners) && requestBody.remove_owners.length > 0) {
            await Clan.updateOne(
                { _id: clan_id },
                { $pull: { owners: { $in: requestBody.remove_owners } } }
            );
            delete requestBody.remove_owners;
        }

        // remove socials
        if (requestBody.remove_socials && Array.isArray(requestBody.remove_socials) && requestBody.remove_socials.length > 0) {
            await Clan.updateOne(
                { _id: clan_id },
                { $pull: { socials: { platform: { $in: requestBody.remove_socials } } } }
            );
        }
        delete requestBody.remove_socials;

        // add socials
        if (requestBody.socials && Array.isArray(requestBody.socials) && requestBody.socials.length > 0) {
            await Clan.updateOne(
                { _id: clan_id },
                { $addToSet: { socials: { $each: requestBody.socials } } }
            );
            delete requestBody.socials;
        }

        // add categories
        if (requestBody.categories && Array.isArray(requestBody.categories) && requestBody.categories.length > 0) {
            await Clan.updateOne(
                { _id: clan_id },
                { $addToSet: { categories: { $each: requestBody.categories } } }
            );
            delete requestBody.categories;
        }

        // add socials
        if (requestBody.remove_categories && Array.isArray(requestBody.remove_categories) && requestBody.remove_categories.length > 0) {
            await Clan.updateOne(
                { _id: clan_id },
                { $pull: { categories: { $in: requestBody.remove_categories } } }
            );
            delete requestBody.remove_categories;
        }

        let updateConditions = {};
        clan = await Clan.findOne({_id: clan_id}, {categories: 1})
        if(clan.categories.length < 1) {
            updateConditions.categories = ['everything']
        }
                
        if (requestBody.name) updateConditions.name = requestBody.name;
        if (requestBody.tag) updateConditions.tag = requestBody.tag;
        if (requestBody.logo) updateConditions.logo = requestBody.logo;

        // The requesting user is assigned as an owner and added to the members list. This is not something that can be overridden.
        if (requestBody.owners) {
            requestBody.owners = Array.isArray(requestBody.owners) ? [...new Set(requestBody.owners.map(owner_id => owner_id.trim()))] : [requestBody.owners.trim()];
            requestBody.members = Array.isArray(requestBody.members) ? [...new Set(requestBody.members.map(member_id => member_id.trim()))] : [requestBody.owners.trim()];

            updateConditions.$set.owners = requestBody.owners;
            updateConditions.$set.members = requestBody.members;
        }
        
        let updatedClan = await Clan.updateOne({ _id: clan_id }, { $set: updateConditions })
        return res.status(200).json(
            await Clan.findOne({_id: clan_id}, {__v:0}).populate({
                path: 'members positive_ratings negative_ratings',
                select: '-__v -joined_clans'
            })
        )
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})

// only current clan members can upvote or downvote a clan
router.put('/upvote/:clan_id?', async (req, res) => {
    try {
        let clan_id = req.params.clan_id
        if (!clan_id || clan_id.trim() === "" || !mongoose.isValidObjectId(clan_id)) {
            return res.status(400).json({
                message: "Missing or invalid 'clan_id' parameter"
            });
        }
        if (!mongoose.isValidObjectId(req.user.userId)) {
            return res.status(400).json({
                message: "User ID is not a valid Mongoose.ObjectId. Please contact a developer if you encounter this error!"
            });
        }
    
        let clan = await Clan.findOne({ _id: clan_id });
        if (!clan) {
            return res.status(404).json({
                message: "Clan not found"
            });
        }
    
        let isUserAClanMember = clan.members.includes(req.user.userId);
        if (!isUserAClanMember) {
            return res.status(403).json({
                message: "You cannot upvote this clan because you're not a registered member"
            });
        }
    
        if (clan.positive_ratings.includes(req.user.userId)) {
            return res.status(400).json({
                message: "Clan already upvoted"
            });
        }
    
        let updateConditions = {};
        if (clan.negative_ratings.includes(req.user.userId)) {
            updateConditions.$pull = { negative_ratings: req.user.userId };
        }
    
        updateConditions.$addToSet = { positive_ratings: req.user.userId };
    
        await Clan.updateOne({ _id: clan_id }, updateConditions);
    
        return res.status(200).json({
            message: "Clan upvoted"
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            message: "Some sort of internal server error has occurred!"
        });
    }
})
router.put('/downvote/:clan_id?', async (req, res) => {
    try {
        let clan_id = req.params.clan_id
        if (!clan_id || clan_id.trim() === "" || !mongoose.isValidObjectId(clan_id)) {
            return res.status(400).json({
                message: "Missing or invalid 'clan_id' parameter"
            });
        }        
        if (!mongoose.isValidObjectId(req.user.userId)) {
            return res.status(400).json({
                message: "User ID is not a valid Mongoose.ObjectId. Please contact a developer if you encounter this error!"
            });
        }
    
        let clan = await Clan.findOne({ _id: clan_id });
        if (!clan) {
            return res.status(404).json({
                message: "Clan not found"
            });
        }
    
        let isUserAClanMember = clan.members.includes(req.user.userId);
        if (!isUserAClanMember) {
            return res.status(403).json({
                message: "You cannot downvote this clan because you're not a registered member"
            });
        }
    
        if (clan.negative_ratings.includes(req.user.userId)) {
            return res.status(400).json({
                message: "Clan already downvoted"
            });
        }
    
        let updateConditions = {};
        if (clan.positive_ratings.includes(req.user.userId)) {
            updateConditions.$pull = { positive_ratings: req.user.userId };
        }
    
        updateConditions.$addToSet = { negative_ratings: req.user.userId };
    
        await Clan.updateOne({ _id: clan_id }, updateConditions);
    
        return res.status(200).json({
            message: "Clan downvoted"
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            message: "Some sort of internal server error has occurred!"
        });
    }
})
// clan creator, mods and admin can delete clans
router.delete('/delete/:clan_id?', async (req, res) => {
    try {
        let clan_id = req.params.clan_id
        if (!clan_id || clan_id.trim() === "" || !mongoose.isValidObjectId(clan_id)) {
            return res.status(400).json({
                message: "Missing or invalid 'clan_id' parameter"
            });
        }

        let clan = await Clan.findOne({_id: clan_id})
        if(!clan) {
            return res.status(404).json({
                message: "Clan not found"
            })
        }

        let userRole = await User.getRole(req.user.userId)
        let isMod = userRole == 'moderator'
        let isAdmin = userRole == 'admin'
        let isDev = req.user.discordId = process.env.developer_discord_id
        let isClanCreator = clan.created_by == req.user.userId

        if(!isClanCreator && (!isMod && !isAdmin && !isDev)) {
            return res.status(403).json({
                message: "You do not have permissions to delete this clan"
            })
        }
        
        await Clan.deleteOne({_id: clan_id})
        return res.status(200).json({
            message: "Clan deleted successfully"
        })
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})

// transfers lead clan ownership (done)
router.put('/transfer-ownership', async (req, res) => {
    try {
        let requestBody = req.body

        if(requestBody.to) requestBody.to = requestBody.to.trim()
        if(requestBody.from) requestBody.from = requestBody.from.trim()
        if(requestBody.clan_id) requestBody.clan_id = requestBody.clan_id.trim()
        
        const transferSchema = joi.object({
            clan_id: joi.string()
                .custom((value, helper) => {
                    if (!mongoose.isValidObjectId(value)) {
                    return helper.message(`"clan_id": "${value}" must be a valid Mongoose.ObjectId`);
                    }
                })
                .required(),
            from: joi.string()
                .custom((value, helper) => {
                    if (!mongoose.isValidObjectId(value)) {
                    return helper.message(`"from": "${value}" must be a valid Mongoose.ObjectId`);
                    }
                })
                .required(),
            to: joi.string()
                .custom((value, helper) => {
                    if (!mongoose.isValidObjectId(value)) {
                    return helper.message(`"to": "${value}" must be a valid Mongoose.ObjectId`);
                    }
                })
                .required()
        })

        if(requestBody.to == requestBody.from) {
            return res.status(409).json({
                message: "'to' and 'from' fields can not be equal"
            })
        }

        let userRole = await User.getRole(req.user.discordId);
        let isMod = userRole === 'moderator';
        let isAdmin = userRole === 'admin';
        let isDev = req.user.discordId === process.env.developer_discord_id;

        if (requestBody.from && requestBody.from !== req.user.userId) {
            if (!isMod && !isAdmin && !isDev) {
                return res.status(403).json({
                    message: "You do not have permissions to manually set 'from'"
                });
            }
        } else {
            requestBody.from = req.user.userId;
        }

        const {error} = transferSchema.validate(requestBody)
        if(error) {
            return res.status(400).json({
                message: error.details[0].message,
                origianl_request_body: requestBody
            })
        }    

        let clan = await Clan.findOne({ _id: requestBody.clan_id });
        if (!clan) {
            return res.status(404).json({
                message: "Clan not found"
            });
        }

        if (clan.created_by.toString() !== req.user.userId && !isMod && !isAdmin && !isDev) {
            return res.status(403).json({
                message: "You cannot transfer ownership of this clan."
            });
        }

        let targetUser = await User.findOne({ _id: requestBody.to });
        if (!targetUser) {
            return res.status(404).json({
                message: "'to' user not found"
            });
        }
        if (!clan.members.includes(requestBody.to)) {
            return res.status(409).json({
                message: "'to' user is not a clan member"
            });
        }
        if (targetUser.banned) {
            return res.status(409).json({
                message: "'to' user is banned"
            });
        }

        clan.created_by = requestBody.to;
        await clan.save();

        return res.status(200).json({
            message: "Clan ownership transferred successfully."
        });
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})

module.exports = router