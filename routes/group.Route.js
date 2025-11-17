const express = require("express");
const router = express.Router();
const {
  addGroup,
  getAllGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  createCustomGroup,
  addGroupMember,
  deleteGroupMember,
} = require("../controllers/group.Controller");

const { authenticate, authorize } = require("../middleware/auth.Middleware");

// Require authentication for all group routes
router.use(authenticate);

//Route to create a group (protected)
router.post("/", authorize, addGroup);

//Route to create custom groups (protected)
router.post("/custom", authorize, createCustomGroup);

//Route to add a group member (protected)
router.post("/member", authorize, addGroupMember);

//Route to get all groups (public to authenticated users)
router.get("/", getAllGroups);

//Route to get a single group (public to authenticated users)
router.get("/:id", getGroupById);

//Route to update a group (protected)
router.put("/:id", authorize, updateGroup);

//Route to delete a group member (protected)
router.delete("/member/:studentId", authorize, deleteGroupMember);

//Route to delete group (protected)
router.delete("/:id", authorize, deleteGroup);

module.exports = router;
