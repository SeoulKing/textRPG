const test = require("node:test");
const assert = require("node:assert/strict");
const { CheckpointWriter } = require("../.server-dist/online/checkpoint-writer");
const { completeLife } = require("../.server-dist/online/life");
const { emptyPlazaMarket } = require("../.server-dist/online/plaza-market");
const { emptyPlazaBuyOrders, transactPlazaBuyOrder } = require("../.server-dist/online/plaza-buy-orders");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, failed) => {
    resolve = done;
    reject = failed;
  });
  return { promise, resolve, reject };
}

test("a committed ticket completes while a later checkpoint is still waiting and can fail", { timeout: 2000 }, async () => {
  const entered = [deferred(), deferred()];
  const commits = [deferred(), deferred()];
  const storageError = new Error("second checkpoint failed");
  const faults = [];
  let transactionCount = 0;
  const writer = new CheckpointWriter({
    async transaction(operation) {
      const index = transactionCount++;
      await operation({ put: async () => {} });
      entered[index].resolve();
      await commits[index].promise;
    },
  }, error => faults.push(error));

  const first = writer.enqueue({ world: { revision: 1 }, actors: [] }, [], []);
  await entered[0].promise;
  let firstCommitted = false;
  const firstConfirmed = writer.waitThrough(first).then(() => { firstCommitted = true; });
  const second = writer.enqueue({ world: { revision: 2 }, actors: [] }, [], []);
  const secondFailed = assert.rejects(writer.waitThrough(second), /second checkpoint failed/);
  await Promise.resolve();
  assert.equal(firstCommitted, false);

  commits[0].resolve();
  await firstConfirmed;
  await entered[1].promise;
  commits[1].reject(storageError);

  await secondFailed;
  await writer.waitThrough(first);
  await assert.rejects(writer.flush(), /second checkpoint failed/);
  assert.deepEqual(faults, [storageError]);
});

function marketActor(id, money, inventory = {}) {
  return { character: { id, name: id }, game: { state: { money, inventory } } };
}

test("a partial purchase pays the seller and refunds only the unfilled expired units", () => {
  const book = emptyPlazaBuyOrders();
  const market = emptyPlazaMarket();
  const buyer = marketActor("buyer", 100);
  const seller = marketActor("seller", 5, { riverFish: 1 });

  transactPlazaBuyOrder(book, market, buyer, 1, {
    action: "placeBuyOrder", itemId: "riverFish", quantity: 3, unitPrice: 5,
  });
  const order = book.orders[0];
  assert.equal(buyer.game.state.money, 85);

  const fill = transactPlazaBuyOrder(book, market, seller, 1, { action: "fillBuyOrder", orderId: order.id });
  assert.equal(fill.sale.unitPrice, 5);
  assert.equal(seller.game.state.money, 10);
  assert.equal(seller.game.state.inventory.riverFish, undefined);
  assert.equal(book.orders[0].quantity, 2);
  assert.deepEqual(book.purchases.buyer, { riverFish: 1 });
  assert.equal(market.soldUnits.seller, 1);

  transactPlazaBuyOrder(book, market, buyer, order.expiresDay, { action: "collectPurchases" });
  transactPlazaBuyOrder(book, market, buyer, order.expiresDay, { action: "cancelBuyOrder", orderId: order.id });
  assert.equal(buyer.game.state.money, 95);
  assert.deepEqual(buyer.game.state.inventory, { riverFish: 1 });
  assert.deepEqual(book.orders, []);
  assert.deepEqual(book.purchases, {});
});

test("a full product stack leaves production materials, mastery and job progress intact", () => {
  const state = {
    inventory: { treeBranch: 2, wood: Number.MAX_SAFE_INTEGER },
    arcanaCombat: { skillTraining: {} },
    arcanaLife: { craftedItems: 4, cookedMeals: 0 },
  };
  const job = { phase: "active", kind: "craft", recipeId: "lumber", quantity: 2, completed: 1, resultCounts: { wood: 3 } };
  const before = structuredClone({ state, job });

  assert.throws(() => completeLife({ game: { state } }, job, () => 0), { code: "life_result_capacity" });
  assert.deepEqual({ state, job }, before);
});
