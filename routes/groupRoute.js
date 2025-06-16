const express = require('express');
const router = express.Router();
const {
  addGroup,
  getAllGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
} = require('../controllers/groupController');

//Route to create a group
router.post('/', addGroup);

//Route to get all group
router.get('/', getAllGroups);

//Route to get group
router.get('/:id', getGroupById);

//Route to update a course
router.put('/:id', updateGroup);

//Route to delete group
router.delete('/:id', deleteGroup);
module.exports = router;
