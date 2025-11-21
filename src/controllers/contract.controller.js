// src/controllers/contract.controller.js
const contractService = require('../services/contract.service');

class ContractController {
  // CREATE CONTRACT
  async createContract(req, res, next) {
    try {
      const userId = req.user.id;
      const contract = await contractService.createContract(userId, req.body);

      res.status(201).json({
        success: true,
        data: contract
      });
    } catch (error) {
      next(error);
    }
  }

  // LIST ALL CONTRACTS
  async listContracts(req, res, next) {
    try {
      const filters = {
        status: req.query.status,
        search: req.query.search,
        created_by: req.query.created_by,
        sort: req.query.sort || 'created_at',
        order: req.query.order || 'DESC',
        limit: req.query.limit || 50,
        offset: req.query.offset || 0
      };

      const result = await contractService.listContracts(filters);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // GET CONTRACT BY ID
  async getContractById(req, res, next) {
    try {
      const { id } = req.params;
      const contract = await contractService.getContractById(id);

      res.status(200).json({
        success: true,
        data: contract
      });
    } catch (error) {
      next(error);
    }
  }

  // GET CONTRACT BY CODE
  async getContractByCode(req, res, next) {
    try {
      const { code } = req.params;
      const contract = await contractService.getContractByCode(code);

      res.status(200).json({
        success: true,
        data: contract
      });
    } catch (error) {
      next(error);
    }
  }

  // UPDATE CONTRACT
  async updateContract(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const contract = await contractService.updateContract(id, userId, req.body);

      res.status(200).json({
        success: true,
        data: contract
      });
    } catch (error) {
      next(error);
    }
  }

  // SUBMIT FOR REVIEW
  async submitForReview(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const contract = await contractService.submitForReview(id, userId);

      res.status(200).json({
        success: true,
        data: contract,
        message: 'Contract review için gönderildi.'
      });
    } catch (error) {
      next(error);
    }
  }

  // REVIEW CONTRACT
  async reviewContract(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const contract = await contractService.reviewContract(id, userId, req.body);

      res.status(200).json({
        success: true,
        data: contract,
        message: req.body.approved ? 'Contract onaylandı.' : 'Contract draft\'a geri gönderildi.'
      });
    } catch (error) {
      next(error);
    }
  }

  // APPROVE CONTRACT
  async approveContract(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const contract = await contractService.approveContract(id, userId);

      res.status(200).json({
        success: true,
        data: contract,
        message: 'Contract nihai onay aldı.'
      });
    } catch (error) {
      next(error);
    }
  }

  // PUBLISH CONTRACT
  async publishContract(req, res, next) {
    try {
      const { id } = req.params;
      const { market_id } = req.body;

      const contract = await contractService.publishContract(id, market_id);

      res.status(200).json({
        success: true,
        data: contract,
        message: 'Contract yayınlandı ve market\'a bağlandı.'
      });
    } catch (error) {
      next(error);
    }
  }

  // ADD EVIDENCE
  async addEvidence(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const evidence = await contractService.addEvidence(id, userId, req.body);

      res.status(201).json({
        success: true,
        data: evidence,
        message: 'Kanıt eklendi.'
      });
    } catch (error) {
      next(error);
    }
  }

  // VERIFY EVIDENCE
  async verifyEvidence(req, res, next) {
    try {
      const { evidenceId } = req.params;
      const userId = req.user.id;

      const evidence = await contractService.verifyEvidence(evidenceId, userId);

      res.status(200).json({
        success: true,
        data: evidence,
        message: 'Kanıt doğrulandı.'
      });
    } catch (error) {
      next(error);
    }
  }

  // RESOLVE CONTRACT
  async resolveContract(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const contract = await contractService.resolveContract(id, userId, req.body);

      res.status(200).json({
        success: true,
        data: contract,
        message: 'Contract çözümlendi.'
      });
    } catch (error) {
      next(error);
    }
  }

  // GET TEMPLATES
  async getTemplates(req, res, next) {
    try {
      const templates = await contractService.getTemplates();

      res.status(200).json({
        success: true,
        data: { templates }
      });
    } catch (error) {
      next(error);
    }
  }

  // DELETE CONTRACT
  async deleteContract(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await contractService.deleteContract(id, userId);

      res.status(200).json({
        success: true,
        message: 'Contract silindi.'
      });
    } catch (error) {
      next(error);
    }
  }

  // PUBLIC: Get contract preview (for public viewing)
  async getContractPreview(req, res, next) {
    try {
      const { code } = req.params;
      const contract = await contractService.getContractByCode(code);

      // Return only public information
      const publicData = {
        contract_code: contract.contract_code,
        title: contract.title,
        specification: {
          scope: contract.scope,
          underlying: contract.underlying,
          source_agencies: contract.source_agencies,
          payout_criterion: contract.payout_criterion,
          expiration: {
            date: contract.expiration_date,
            time: contract.expiration_time,
            timezone: contract.expiration_timezone
          },
          contingencies: contract.contingency_rules
        },
        market_url: contract.market_id ? `/markets/${contract.market_id}` : null,
        status: contract.status
      };

      res.status(200).json({
        success: true,
        data: publicData
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ContractController();
