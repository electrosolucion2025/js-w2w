import Allergen from '../models/allergen.js';
import Category from '../models/category.js';
import Extra from '../models/extra.js';
import Product from '../models/product.js';
import redisClient from './redisClient.js';

export const generateMenuJSON = async (businessId) => {
  try {
    console.log(`Generating menu for business ID: ${businessId}`);

    // Comprobamos si el businessId es válido
    if (!businessId) {
      console.error('Business ID is undefined or null');
      return [];
    }

    // Intentar obtener el menú de Redis primero
    const cachedMenu = await redisClient.get(`menu:${businessId}`);
    if (cachedMenu) {
      console.log('Returning cached menu');
      return JSON.parse(cachedMenu);
    }

    console.log(`Generating menu for business ID: ${businessId}`);

    const categories = await Category.find({ businessId });

    if (categories.length === 0) {
      // Intenta buscar alguna categoría para verificar si la conexión a la BD está bien
      const sampleCategory = await Category.findOne({});
      console.log(`BD connection OK. Sample category: ${sampleCategory}`);
    }

    const menu = [];

    for (const category of categories) {
      const products = await Product.find({ categoryId: category._id });
      const items = [];

      for (const product of products) {
        const allergens = await Allergen.find({ _id: { $in: product.allergens || [] } });
        const extras = await Extra.find({ _id: { $in: product.extras || [] } });

        items.push({
          id: product._id.toString(),
          name: product.name,
          price: product.price,
          description: product.description,
          available: product.available,
          ingredients: product.ingredients,
          allergens: allergens.map(allergen => ({
            id: allergen._id.toString(),
            name: allergen.name
          })),
          extras: extras.map(extra => ({
            id: extra._id.toString(),
            name: extra.name,
            price: extra.price,
            available: extra.available
          }))
        });
      }

      menu.push({
        id: category._id.toString(),
        category: category.name,
        items
      });
    }

    console.log(`Generated menu with ${menu.length} categories`);

    // Guardar menú en Redis
    await redisClient.set(
      `menu:${businessId}`,
      JSON.stringify(menu),
      'EX',
      3600 // 1 hora de expiración
    );

    return menu;
  } catch (error) {
    console.error('Error generating menu JSON:', error.message);
    console.error(error.stack);
    throw error;
  }
};