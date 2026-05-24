const BaseService = require('./BaseService');
const prisma = require('../config/prisma');

class TicketService extends BaseService {
  constructor() {
    super(prisma.ticket);
  }

  async getOpenTickets() {
    return this.model.findMany({
      where: {
        status: 'open'
      }
    });
  }

  async closeTicket(ticketId) {
    return this.model.update({
      where: {
        id: ticketId
      },
      data: {
        status: 'closed',
        closedAt: new Date()
      }
    });
  }

  async getTicketsByPriority(priority) {
    return this.model.findMany({
      where: {
        priority
      }
    });
  }
}

module.exports = new TicketService();