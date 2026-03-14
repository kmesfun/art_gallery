/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_424458908")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.isAdmin = true",
    "deleteRule": "@request.auth.isAdmin = true",
    "updateRule": "@request.auth.isAdmin = true"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_424458908")

  // update collection data
  unmarshal({
    "createRule": null,
    "deleteRule": null,
    "updateRule": null
  }, collection)

  return app.save(collection)
})
