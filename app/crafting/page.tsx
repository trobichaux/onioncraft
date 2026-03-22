import GoalsPanel from './GoalsPanel';
import ProfitTable from './ProfitTable';
import RefreshButton from './RefreshButton';
import ShoppingList from './ShoppingList';

export default function CraftingPage() {
  return (
    <div>
      <h1>Crafting Profit Calculator</h1>

      <section aria-labelledby="goals-heading">
        <h2 id="goals-heading">Crafting Goals</h2>
        <p className="section-desc">
          Add items you&apos;re saving materials for (e.g. legendaries). Materials needed for these
          goals will be <strong>reserved</strong> and excluded from profit calculations.
        </p>
        <GoalsPanel />
      </section>

      <section aria-labelledby="profit-heading">
        <h2 id="profit-heading">Profitable Crafts</h2>
        <p className="section-desc">
          Shows the most profitable items you can craft from your <strong>remaining</strong> materials
          (after reserving for goals). Click Refresh Prices to update TP data and recalculate.
        </p>
        <RefreshButton />
        <ProfitTable />
      </section>

      <section aria-labelledby="shopping-heading">
        <h2 id="shopping-heading">Shopping List</h2>
        <p className="section-desc">
          Your saved crafting plan. Check off items as you complete them in-game.
          This list persists between visits and will be available to external plugins.
        </p>
        <ShoppingList />
      </section>
    </div>
  );
}
