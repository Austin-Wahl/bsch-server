const mongoose = require('mongoose')
const clanSchema = require('./clan.model')
const SocialMediaSchema = require('./socialmedia.schema')

const userSchema = new mongoose.Schema({
    discord_id: {
        type: String,
        required: true,
        immutable: true
    },
    username: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ["user", "challenge currator", "challenge currator lead", "moderator", "admin"],
        default: "user"
    },
    banned: {
        type: Boolean,
        default: false
    },
    avatar: {
        type: String,
        required: true,
        default: "https://static.vecteezy.com/system/resources/thumbnails/004/511/281/small/default-avatar-photo-placeholder-profile-picture-vector.jpg"
    },
    bio: {
        type: String,
        required: false,
        maxLength: 1000,
        default: ""
    },
    socials: {
        type: [SocialMediaSchema],
        validate: {
            validator: v => v.length <= 10,
            message: props => `${props.path} exceeds the limit of 10`
        }
    },
    joined_clans: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Clan'
    }],
    created_at: {
        type: Number,
        default: Math.floor(Date.now() / 1000),
        immutable: true
    }
})

/**
 * Gets a user role based on discord_id
 * @param {*} discord_id 
 * @returns user role
 */
userSchema.statics.getRole = async function(discord_id) {
    let user = (await this.findOne({ discord_id: discord_id}, { role: 1}))
    return (user) ? user["role"] : "user"
}
module.exports = mongoose.model('User', userSchema)