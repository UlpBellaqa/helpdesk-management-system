class BaseService {
  constructor(model) {
    this.model = model;
  }

  async findAll() {
    return this.model.findMany();
  }

  async findById(id) {
    return this.model.findUnique({
      where: { id }
    });
  }

  async create(data) {
    return this.model.create({
      data
    });
  }

  async update(id, data) {
    return this.model.update({
      where: { id },
      data
    });
  }

  async delete(id) {
    return this.model.delete({
      where: { id }
    });
  }
}

module.exports = BaseService;