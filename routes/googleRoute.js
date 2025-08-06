const express = require("express");
const router = express.Router();

const {
  googleAuth,
  googleCallback,
  revokeGoogleAccess,
} = require("../controllers/googleController");

router.post("/revoke", revokeGoogleAccess);

router.get("/", googleAuth);

router.get("/callback", googleCallback);



module.exports = router;
