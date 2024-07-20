const mongoose = require('mongoose')

const SocialMediaSchema = new mongoose.Schema({
    platform: {
        type: String,
        required: true
    },
    platform_profile_link: {
        type: String,
        required: true
    },
    platform_logo: {
        type: String,
        required: true
    }, 
    public: {
        type: Boolean,
        default: false
    }
})

module.exports = SocialMediaSchema