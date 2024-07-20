const mongoose = require('mongoose')
const weekylyChallengeSchemaNoEditHistory = require('./weekylyChallengeSchemaNoEditHistory.schema')

const scoreSubmissionSchema = new mongoose.Schema({
    player_id: {
        type: Number,
        required: true
    },
    map_id: {
        type: String,
        required: true
    },
    score: {
        type: Number,
        required: true
    },
    clan: {
        type: mongoose.ObjectId,
        ref: 'Clan',
        required: true
    },
    difficulty: {
        type: String,
        required: true,
    }
})

const weeklyChallengeSchema = new mongoose.Schema({
    week_number: {
        type: Number,
        required: true,
        min: 1
    },
    created_by: {
        type: mongoose.ObjectId,
        ref: 'User',
        required: true
    },
    edited_by: {
        type: [mongoose.ObjectId],
        ref: 'User'
    },
    description: {
        type: String,
        default: '',
        maxLength: 5000
    },
    challenge_cover: {
        type: String,
        default: 'https://static.vecteezy.com/system/resources/thumbnails/004/511/281/small/default-avatar-photo-placeholder-profile-picture-vector.jpg'
    },
    map_pool: {
        type: [mapPoolSchema],
        required: true,
        validate: {
            validator: array => array.length > 0,
            message: props => `${props.path} must contain at least 1 map`
        }
    },
    playlist_download_link: {
        type: String,
        required: true,
        default: ''
    },
    score_accept_start: {
        type: Number,
        required: true,
        validate: {
            validator: date => date <= Math.floor(Date.now() / 1000),
            message: props => `${props} can not be set to a past date/time`
        }
    },
    score_accept_end: {
        type: Number,
        required: true,
        validate: {
            validator: date => date <= Math.floor(Date.now() / 1000),
            message: props => `${props} can not be set to a past date/time`
        },
    },
    edit_history: {
        type: [weekylyChallengeSchemaNoEditHistory],
    },
    score_submissions: {
        type: [scoreSubmissionSchema]
    },
    edited_at: {
        type: Number,
        default: Math.floor(Date.now() / 1000)
    },
    created_at: {
        type: Number,
        default: Math.floor(Date.now() / 1000),
        immutable: true
    }
})

module.exports = mongoose.model('WeeklyChallenge', weeklyChallengeSchema)