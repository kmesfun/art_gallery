/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_424458908")

  // update collection data
  unmarshal({
    "name": "artworks"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_424458908")

  // update collection data
  unmarshal({
    "name": "artwork"
  }, collection)

  return app.save(collection)
})
