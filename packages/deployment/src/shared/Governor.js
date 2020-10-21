class Governor {
  static validate(EOAorDAO) {
    if (typeof EOAorDAO === 'string') return
    if (typeof EOAorDAO !== 'object') throw Error('A string or DAO object (agent, voting, tokenManager) must be given')
    if (!EOAorDAO.agent || !EOAorDAO.voting || !EOAorDAO.tokenManager) throw Error('A DAO governor must include an agent, voting, and tokenManager addresses')
  }

  constructor(EOAorDAO) {
    Governor.validate(EOAorDAO)
    this.EOAorDAO = EOAorDAO
  }

  get address() {
    return this.isEOA() ? this.EOAorDAO : this.EOAorDAO.agent
  }

  get agent() {
    this._assertDAO()
    return this.EOAorDAO.agent
  }

  get voting() {
    this._assertDAO()
    return this.EOAorDAO.voting
  }

  get tokenManager() {
    this._assertDAO()
    return this.EOAorDAO.tokenManager
  }

  isDAO() {
    return !this.isEOA()
  }

  isEOA() {
    return typeof this.EOAorDAO === 'string'
  }

  describe() {
    return `${this.address} (${this.isEOA() ? 'EOA' : 'DAO'})`
  }

  toString() {
    return this.address
  }

  _assertDAO() {
    if (this.isEOA()) throw Error('Given governor is an EOA, not a DAO')
  }
}

module.exports = EOAorDAO => new Governor(EOAorDAO)
