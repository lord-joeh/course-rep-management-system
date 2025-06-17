const express = require('express');
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
} = require('../controllers/groupController');

//Route to create a group
router.post('/', addGroup);

//Route to create custom groups
router.post('/custom', createCustomGroup);

//Route to add add a group member
router.post('/member', addGroupMember);

//Route to get all group
router.get('/', getAllGroups);

//Route to get group
router.get('/:id', getGroupById);

//Route to update a course
router.put('/:id', updateGroup);

//Route to delete a group member
router.delete('/:id', deleteGroupMember);

//Route to delete group
router.delete('/:id', deleteGroup);

module.exports = router;
