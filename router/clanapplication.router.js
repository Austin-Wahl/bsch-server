const router = require('express').Router()
const mongoose = require('mongoose')
const ClanApplication = require('../models/clanapplication.model')
const joi = require('joi')
const Clan = require('../models/clan.model')

const {authentication, checkRole, checkBannedStatus} = require('../authentication/middlewares')

router.get('/get/:application_id?', async (req, res) => {
    try {
        let application_id = req.params.application_id;

        if (!application_id || application_id.trim() === "" || !mongoose.isValidObjectId(application_id)) {
            return res.status(400).json({
                message: "Missing or invalid 'application_id' parameter"
            });
        }

        let result = await ClanApplication.find({}, {__v:0}).where('_id').equals(application_id).populate({
            path: "submitted_by",
            select: "-__v -joined_clans"
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
            applications = await ClanApplication.find({ $and: queryConditions }).select('-__v').populate({
                path: 'submitted_by',
                select: '-__v'
            })
        } else {
            applications = await ClanApplication.find().select('-__v').populate({
                path: 'submitted_by',
                select: '-__v'
            })
        }
        
        if(applications.length < 1) {
            return res.status(404).json({
                message: "Clan applications not found"
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

// application operations
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
        if(!clan.owners.includes(req.user.userId) && clan.created_by != req.user.userId) {
            return res.status(403).json({
                message: "User does not have permission to submit an application for this clan"
            })
        }

        let previousClanApplications = await ClanApplication.find({clan_id: requestBody.clan_id})
        let previousClanApplicationsBySubmittedBy = await ClanApplication.find({
            submitted_by: requestBody.submitted_by,
            $or: [
                { status: 'applied' },
                { status: 'in review' }
            ]
        });
        
        if(previousClanApplications.length >= 1) {
            return res.status(400).json({
                message: "An application already exists for this clan"
            })
        }
        if(previousClanApplicationsBySubmittedBy.length >= 3) {
            return res.status(400).json({
                message: "User already has 3 pending applications"
            })
        }

        let submission = new ClanApplication(requestBody)
        submission = await submission.save()

        return res.status(200).json(
            await ClanApplication.findOne({_id: submission._id}, {__v:0})
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

        let clan = await ClanApplication.findOne({_id: application_id}, {__v:0})

        if(!clan) {
            return res.status(404).json({
                message: "Clan not found"
            })
        }

        if(clan.submitted_by != req.user.userId) {
            return res.status(403).json({
                message: "You can not pull this application"
            })
        }

        if(clan.status == 'deleted') {
            return res.status(400).json({
                message: "Clan application already removed."
            })
        }

        clan = await ClanApplication.updateOne({ _id: application_id }, {
            $set: {
                status: "deleted"
            }
        })

        return res.status(200).json({
            message: "Clan application removed successfully"
        })
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Some sort of internal server error has occured!"
        })
    }
})
// administrative actions
router.put('/change-status/:application_id?', checkRole("admin"), async (req, res) => {
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
                .valid("in review", "accepted", "denied", "deleted")
        })

        const validatedResponseError = statusChangeSchema.validate(requestBody).error
        if(validatedResponseError) {
            return res.status(400).json({
                message: validatedResponseError.details[0].message,
                origianl_request_body: requestBody
            })
        }

        let application = await ClanApplication.findOne({_id: application_id}, {__v:0})

        if(!application) {
            return res.status(404).json({
                message: "Clan application not found"
            })
        }

        if(application.status == 'deleted') {
            return res.status(400).json({
                message: "You can not change the status of a deleted application"
            })
        }
        
        if(requestBody.status == 'accepted') {
            await Clan.updateOne({ _id: application.clan_id}, {
                $set: {
                    bsch_approved: true
                }
            })
        } else {
            await Clan.updateOne({ _id: application.clan_id}, {
                $set: {
                    bsch_approved: false
                }
            })
        }
        application = await ClanApplication.updateOne({ _id: application_id }, {
            $set: {
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