const mongoose = require('mongoose')

const weeklyChallengeSchemaNoEditHistory = new mongoose.Schema({
    week_number: {
        type: Number,
        required: true,
        min: 1
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
            validator: date => date >= Math.floor(Date.now() / 1000),
            message: props => `${props} can not be set to a past date/time`
        }
    },
    score_accept_end: {
        type: Number,
        required: true,
        validate: {
            validator: date => date >= Math.floor(Date.now() / 1000),
            message: props => `${props} can not be set to a past date/time`
        },
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