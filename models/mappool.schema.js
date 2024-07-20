const mongoose = require('mongoose')

const difficultySchema = new mongoose.Schema({
    easy: {
        type: Boolean,
        default: true,
    },
    normal: {
        type: Boolean,
        default: true
    },
    hard: {
        type: Boolean,
        default: true
    },
    expert: {
        type: Boolean,
        default: true
    },
    expert_plus: {
        type: Boolean,
        default: true
    }
})

const mapPoolSchema = new mongoose.Schema({
    added_by: {
        type: mongoose.ObjectId,
        ref: 'User'
    },
    beatsaver_url: {
        type: String,
        default: 'https://beatsaver.com',
        required: true
    },
    map_cover: {
        type: String,
        default: 'https://static.vecteezy.com/system/resources/thumbnails/004/511/281/small/default-avatar-photo-placeholder-profile-picture-vector.jpg',
        accepted_difficulties: {
            type: difficultySchema,
            required: true
        }
    }
})

module.exports = mapPoolSchema