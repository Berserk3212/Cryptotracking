describe('Stock detail modal - price and volume charts', () => {
  it('renders separate price and volume charts inside modal (no overlap)', () => {
    cy.visit('/crypto/cryptotracking.html');

    // Open stock modal programmatically for stability
    cy.window().then((win) => {
      expect(win.app).to.exist;
      win.app.showStockDetail && win.app.showStockDetail('AAPL');
    });

    // Modal should become visible
    cy.get('#stockDetailModal').should('be.visible');

    // Wait for price & volume canvases to appear inside modal
    cy.get('#stockDetailModal #stockPriceChartContainer canvas', { timeout: 10000 }).should('exist');
    cy.get('#stockDetailModal #stockVolumeChartContainer canvas', { timeout: 10000 }).should('exist');

    // Ensure containers are different DOM elements and do not overlap vertically
    cy.get('#stockDetailModal #stockPriceChartContainer').then(($p) => {
      cy.get('#stockDetailModal #stockVolumeChartContainer').then(($v) => {
        expect($p.get(0)).to.not.equal($v.get(0));

        const pRect = $p.get(0).getBoundingClientRect();
        const vRect = $v.get(0).getBoundingClientRect();

        // price should be above volume (allow small tolerance)
        expect(pRect.bottom).to.be.lessThan(vRect.top + 4);
      });
    });

    // Also assert there are at least two canvases in the modal (price + volume)
    cy.get('#stockDetailModal canvas').its('length').should('be.gte', 2);
  });
});