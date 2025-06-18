const express = require('express');
const router = express.Router();
const {
  addEvent,
  getAllEvent,
  eventById,
  updateEvent,
  deleteEvent,
} = require('../controllers/eventController');

//Route to add event
router.post('/', addEvent);

//Route to get all events
router.get('/', getAllEvent);

//Route to get event by id
router.get('/:id', eventById);

//Route to update event
router.put('/:id', updateEvent);

//Route to delete event
router.delete('/:id', deleteEvent);

module.exports = router;
