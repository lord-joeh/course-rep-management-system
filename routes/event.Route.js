const express = require("express");
const router = express.Router();
const {
  addEvent,
  getAllEvent,
  eventById,
  updateEvent,
  deleteEvent,
} = require("../controllers/event.Controller");
const { authenticate, authorize } = require("../middleware/auth.Middleware");
router.use(authenticate);

//Route to add event
router.post("/", authorize, addEvent);

//Route to get all events
router.get("/", getAllEvent);

//Route to get event by id
router.get("/:id", eventById);

//Route to update event
router.put("/:id", authorize, updateEvent);

//Route to delete event
router.delete("/:id", authorize, deleteEvent);

module.exports = router;
