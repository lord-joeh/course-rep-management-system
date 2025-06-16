const { randomInt } = require('crypto');

const generatedId = async (short) => {
    const generatedId = await randomInt(1000, 9999);
    return `${short}${generatedId}`
}

module.exports = generatedId