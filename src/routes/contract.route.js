// src/routes/contract.route.js
const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contract.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');

// ============================================
// PUBLIC ROUTES (anyone can view)
// ============================================

// GET /api/v1/contracts/:code/preview - Get contract preview (public)
router.get('/:code/preview', contractController.getContractPreview);

// ============================================
// ADMIN ROUTES (Markets team only)
// ============================================

// GET /api/v1/admin/contracts/templates - Get contract templates
router.get('/templates', authMiddleware, adminMiddleware, contractController.getTemplates);

// POST /api/v1/admin/contracts - Create new contract
router.post('/', authMiddleware, adminMiddleware, contractController.createContract);

// GET /api/v1/admin/contracts - List all contracts with filters
router.get('/', authMiddleware, adminMiddleware, contractController.listContracts);

// GET /api/v1/admin/contracts/:id - Get contract by ID
router.get('/:id', authMiddleware, adminMiddleware, contractController.getContractById);

// GET /api/v1/admin/contracts/code/:code - Get contract by code
router.get('/code/:code', authMiddleware, adminMiddleware, contractController.getContractByCode);

// PATCH /api/v1/admin/contracts/:id - Update contract
router.patch('/:id', authMiddleware, adminMiddleware, contractController.updateContract);

// DELETE /api/v1/admin/contracts/:id - Delete contract (drafts only)
router.delete('/:id', authMiddleware, adminMiddleware, contractController.deleteContract);

// POST /api/v1/admin/contracts/:id/submit-review - Submit for review
router.post('/:id/submit-review', authMiddleware, adminMiddleware, contractController.submitForReview);

// POST /api/v1/admin/contracts/:id/review - Review contract
router.post('/:id/review', authMiddleware, adminMiddleware, contractController.reviewContract);

// POST /api/v1/admin/contracts/:id/approve - Approve contract (final)
router.post('/:id/approve', authMiddleware, adminMiddleware, contractController.approveContract);

// POST /api/v1/admin/contracts/:id/publish - Publish contract
router.post('/:id/publish', authMiddleware, adminMiddleware, contractController.publishContract);

// POST /api/v1/admin/contracts/:id/evidence - Add resolution evidence
router.post('/:id/evidence', authMiddleware, adminMiddleware, contractController.addEvidence);

// POST /api/v1/admin/contracts/evidence/:evidenceId/verify - Verify evidence
router.post('/evidence/:evidenceId/verify', authMiddleware, adminMiddleware, contractController.verifyEvidence);

// POST /api/v1/admin/contracts/:id/resolve - Resolve contract
router.post('/:id/resolve', authMiddleware, adminMiddleware, contractController.resolveContract);

module.exports = router;
