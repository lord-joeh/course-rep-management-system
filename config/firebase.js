const admin = require("firebase-admin")
const serviceAccount = require("../course-rep-firebase-cert.json")


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})


module.exports = admin