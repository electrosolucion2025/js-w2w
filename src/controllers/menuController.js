import Allergen from '../models/allergen.js';
import Category from '../models/category.js';
import Extra from '../models/extra.js';
import Product from '../models/product.js';

class MenuController {
  async uploadMenu(req, res) {
    const { businessId, menu } = req.body;

    try {
      for (const categoryData of menu.categories) {
        // Buscar la categoría por nombre y businessId antes de crear una nueva
        let category = await Category.findOne({
          name: categoryData.name,
          businessId
        });

        // Si no existe, crearla. Si existe, la usamos
        if (!category) {
          category = new Category({
            name: categoryData.name,
            businessId
          });
          await category.save();
          console.log(`Categoría creada: ${category.name}`);
        } else {
          console.log(`Categoría existente encontrada: ${category.name}`);
        }

        for (const itemData of categoryData.items) {
          // Use the original item name without the category prefix
          const productName = itemData.name;

          // Procesar alérgenos
          const allergens = await Promise.all((itemData.allergens || []).map(async (allergenName) => {
            let allergen = await Allergen.findOne({ name: allergenName, businessId });
            if (!allergen) {
              allergen = new Allergen({ name: allergenName, businessId });
              await allergen.save();
            }
            return allergen._id;
          }));

          // Procesar extras
          const extras = await Promise.all((itemData.extras || []).map(async (extraData) => {
            let extra = await Extra.findOne({ name: extraData.name, businessId });
            if (!extra) {
              extra = new Extra({
                name: extraData.name,
                price: extraData.price,
                available: extraData.available,
                businessId
              });
              await extra.save();
            } else if (
              extra.price !== extraData.price ||
              extra.available !== extraData.available
            ) {
              // Actualizar el extra si hay cambios
              extra.price = extraData.price;
              extra.available = extraData.available;
              await extra.save();
            }
            return extra._id;
          }));

          // Buscar producto existente por nombre original
          let product = await Product.findOne({
            name: productName,
            businessId
          });

          if (product) {
            // Actualizar producto si existe
            product.price = itemData.price;
            product.description = itemData.description;
            product.available = itemData.available;
            product.ingredients = itemData.ingredients;
            product.allergens = allergens;
            product.extras = extras;

            // Updating an existing product
            await product.save();
            console.log(`Producto actualizado: ${productName}`);
          } else {
            // Crear nuevo producto
            product = new Product({
              name: productName,
              price: itemData.price,
              description: itemData.description,
              available: itemData.available,
              ingredients: itemData.ingredients,
              categoryId: category._id,
              businessId,
              allergens,
              extras
            });
            await product.save();
            console.log(`Producto creado: ${productName}`);
          }
        }
      }

      res.status(200).json({
        message: 'Menú subido correctamente',
        success: true
      });
    } catch (error) {
      console.error('Error al procesar el menú:', error);
      res.status(500).json({
        message: 'Error al subir el menú',
        error: error.message,
        success: false
      });
    }
  }
}

export default MenuController;