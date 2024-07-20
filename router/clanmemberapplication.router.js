const router = require('express').Router()
const Clan = require('../models/clan.model')
const joi = require('joi')
const ClanMemberApplication = require('../models/clanmemberapplication.model')
const mongoose = require('mongoose')

const {authentication, checkRole, checkBannedStatus} = require('../authentication/middlewares')

router.get('/get/:application_id?', async (req, res) => {
    try {
        let application_id = req.params.application_id;

        if (!application_id || application_id.trim() === "" || !mongoose.isValidObjectId(application_id)) {
            return res.status(400).json({
                message: "Missing or invalid 'application_id' parameter"
            });
        }

        let result = await ClanMemberApplication.findOne({ _id: application_id }, {__v:0})

        if(!result) {
            return res.status(404).json({
                message: "Member Application not found"
            })
        }

        return res.status(200).json(result)
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})
router.get('/get-many', async (req, res) => {
    try {
        let applicationIds = req.query.applicationId || ''
        let submittedBy = req.query.submittedBy || ''
        let clanIds = req.query.clanId || ''
        let status = req.query.status || ''

        if(typeof submittedBy == 'object' || typeof clanIds == 'object' || typeof status == 'object') {
            return res.status(409).json({
                message: "Couldn't process request due to one or more duplicate query parameters"
            })
        }

        let queryConditions = []
        if(applicationIds) {
            let applicationIdsArray = applicationIds.split(',').filter(id => id).map(id => id.trim());
            
            if(applicationIdsArray.length > 0) {
                queryConditions.push({
                    _id: {
                        $in: applicationIdsArray
                    }
                })
            }
        }
        if(submittedBy) {
            let submittedByArray = submittedBy.split(',').filter(id => id).map(id => id.trim());
            
            if(submittedByArray.length > 0) {
                queryConditions.push({
                    submitted_by: {
                        $in: submittedByArray
                    }
                })
            }
        }
        if(clanIds) {
            let clanIdsArray = clanIds.split(',').filter(id => id).map(id => id.trim());
            
            if(clanIdsArray.length > 0) {
                queryConditions.push({
                    clan_id: {
                        $in: clanIdsArray
                    }
                })
            }
        }
        if(status) {
            const statusArray = status.split(',').map(status => new RegExp(status, 'i')).filter(status => status)
            queryConditions.push({ 
                $or: statusArray.map(regex => ({ 
                    status: { $regex: regex } 
                })) 
            })
        }

        let applications;
        if (queryConditions.length > 0) {
            applications = await ClanMemberApplication.find({ $and: queryConditions }).select('-__v').populate({
                path: 'submitted_by',
                select: '-__v'
            })
        } else {
            applications = await ClanMemberApplication.find({}, {__v:0}).populate({
                path: 'submitted_by',
                select: '-__v'
            })
        }
        
        if(applications.length < 1) {
            return res.status(404).json({
                message: "Clan member applications not found"
            })
        }
        return res.status(200).json({
            applications
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})


router.use(authentication)
router.use(checkBannedStatus)

router.post('/apply', async (req, res) => {
    try {
        let requestBody = req.body
        if(requestBody.clan_id) requestBody.clan_id = requestBody.clan_id.trim()
        if(requestBody.submitted_by) requestBody.submitted_by = requestBody.submitted_by.trim()
        if(!requestBody.submitted_by) requestBody.submitted_by = req.user.userId

        const applicationSchema = joi.object({
            clan_id: joi.string()
                .required()
                .custom((value, helper) => {
                    if(!mongoose.isValidObjectId(value))
                        return helper.message(`'clan_id': "${value}" must be a valid Mongoose.ObjectId`); 
                }),
            submitted_by: joi.string()
                .required()
                .custom((value, helper) => {
                    if(!mongoose.isValidObjectId(value))
                        return helper.message(`'clan_id': "${value}" must be a valid Mongoose.ObjectId`); 
                })
        })
        const validatedResponseError = applicationSchema.validate(requestBody).error
        if(validatedResponseError) {
            return res.status(400).json({
                message: validatedResponseError.details[0].message,
                origianl_request_body: requestBody
            })
        }

        let clan = await Clan.findOne({ _id: requestBody.clan_id })
        if(!clan) {
            return res.status(404).json({
                message: "Clan not found"
            })
        }
        if(requestBody.submitted_by != req.user.userId) {
            return res.status(409).json({
                message: "'submitted_by' does not match requesting 'user_id'"
            })
        }
        if(!clan.members.includes(req.user.userId)) {
            return res.status(403).json({
                message: "User not in clan"
            })
        }

        let previousClanMemberApplications = await ClanMemberApplication.findOne({
            $and: [
                { clan_id: requestBody.clan_id },
                { submitted_by: requestBody.submitted_by }
            ]
        }, {__v: 0})
        .sort({ created_at: -1 })
        .limit(1);
        
        if(previousClanMemberApplications) {
            if(["applied", "accepted"].includes(previousClanMemberApplications.status)) {
                return res.status(400).json({
                    message: "A member application already exists for this clan"
                })
            }
            // apply 1 week wait to prevent request spamming 
            // at somepoint, i will make this a mutable value that can be set by the clan admin but for now, this is how its implemented
            const oneWeekInSeconds = 7 * 24 * 60 * 60; // Number of seconds in one week
            const currentTimeInSeconds = Math.floor(Date.now() / 1000);
            const deniedAtInSeconds = previousClanMemberApplications.denied_at;
    
            if (currentTimeInSeconds - deniedAtInSeconds <= oneWeekInSeconds) {
                return res.status(400).json({
                    message: "User must wait 1 week before applying again",
                    time_remaining_since_request: Math.floor(oneWeekInSeconds - (currentTimeInSeconds - deniedAtInSeconds))
                });
            }
        }

        let submission = new ClanMemberApplication(requestBody)
        submission = await submission.save()

        return res.status(200).json(
            await ClanMemberApplication.findOne({_id: submission._id}, {__v:0}).populate({
                path: 'submitted_by',
                select: '-__v -joined_clans'
            })
        )
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})
router.put('/pull-application/:application_id?', async (req, res) => {
    try {
        let application_id = req.params.application_id;

        if (!application_id || application_id.trim() === "" || !mongoose.isValidObjectId(application_id)) {
            return res.status(400).json({
                message: "Missing or invalid 'application_id' parameter"
            });
        }

        let clan = await ClanMemberApplication.findOne({_id: application_id}, {__v:0})

        if(!clan) {
            return res.status(404).json({
                message: "Clan member application not found"
            })
        }

        if(clan.submitted_by != req.user.userId) {
            return res.status(403).json({
                message: "You can not pull this application"
            })
        }

        if(clan.status == 'deleted') {
            return res.status(400).json({
                message: "Clan member application already removed."
            })
        }

        clan = await ClanMemberApplication.updateOne({ _id: application_id }, {
            $set: {
                status: "deleted"
            }
        })

        return res.status(200).json({
            message: "Clan member application removed successfully"
        })
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})
// administrative actions
router.put('/change-status/:application_id?', async (req, res) => {
    try {
        let application_id = req.params.application_id;
        let requestBody = req.body
        if(requestBody.status) requestBody.status = requestBody.status.trim()

        if (!application_id || application_id.trim() === "" || !mongoose.isValidObjectId(application_id)) {
            return res.status(400).json({
                message: "Missing or invalid 'application_id' parameter"
            });
        }

        let statusChangeSchema = joi.object({
            status: joi.string()
                .required()
                .valid("applied", "accepted", "rejected", "deleted")
        })

        const validatedResponseError = statusChangeSchema.validate(requestBody).error
        if(validatedResponseError) {
            return res.status(400).json({
                message: validatedResponseError.details[0].message,
                origianl_request_body: requestBody
            })
        }

        let application = await ClanMemberApplication.findOne({_id: application_id}, {__v:0})
        let clan = await Clan.findOne({_id: application.clan_id})
        if(!clan) {
            return res.status(404).json({
                message: "Clan not found"
            })
        }

        if(!application) {
            return res.status(404).json({
                message: "Clan member application not found"
            })
        }

        // only clan owners/creators can change the application status
        if(!clan.owners.includes(req.user.userId) && clan.created_by !== req.user.userId) {
            return res.status(403).json({
                message: "User does not have permissions to change application status"
            })
        }
        
        if(application.status == 'deleted') {
            return res.status(400).json({
                message: "You can not change the status of a deleted application"
            })
        }

        application = await ClanMemberApplication.updateOne({ _id: application_id }, {
            $set: {
                denied_at: (requestBody.status == 'rejected') ? Math.floor(Date.now() / 1000) : 0,
                status: requestBody.status
            }
        })

        return res.status(200).json({
            message: "Clan application status changed successfully"
        })
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})

module.exports = router