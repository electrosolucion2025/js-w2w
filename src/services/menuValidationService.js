/**
 * Menu validation service
 * This service ensures the AI only offers products that actually exist in the menu database
 */

/**
 * Validates if a product exists in the menu
 * @param {string} productName - Product name to check
 * @param {Object} menuJSON - The complete menu data
 * @returns {Object} - Validation result with status and found product if applicable
 */
export const validateProduct = (productName, menuJSON) => {
  try {
    if (!productName || !menuJSON) {
      return { exists: false, message: "Invalid input data" };
    }

    // Normalize the product name for comparison (lowercase, trim)
    const normalizedName = productName.toLowerCase().trim();

    // Check if menu is array-based or object-based
    const categories = Array.isArray(menuJSON) ? menuJSON : menuJSON.categories;

    if (!categories) {
      console.error("Invalid menu format - no categories found");
      return { exists: false, message: "Invalid menu format" };
    }

    // Search through all categories and products
    for (const category of categories) {
      const products = Array.isArray(menuJSON) ? category.items : category.products;

      if (!products || !Array.isArray(products)) {
        continue;
      }

      for (const product of products) {
        const productDbName = product.name.toLowerCase().trim();

        // Check for exact match
        if (productDbName === normalizedName) {
          return {
            exists: true,
            product: product,
            category: Array.isArray(menuJSON) ? category.category : category.name,
            exactMatch: true
          };
        }

        // Check for partial match as fallback
        if (productDbName.includes(normalizedName) || normalizedName.includes(productDbName)) {
          return {
            exists: true,
            product: product,
            category: Array.isArray(menuJSON) ? category.category : category.name,
            exactMatch: false,
            message: `Found similar product: ${product.name}`
          };
        }
      }
    }

    // Not found
    return { exists: false, message: "Product not found in menu" };
  } catch (error) {
    console.error("Error validating product:", error);
    return { exists: false, error: error.message };
  }
};

/**
 * Validates if an extra is valid for a specific product
 * @param {string} extraName - Extra name to check
 * @param {Object} product - The product object
 * @returns {Object} - Validation result
 */
export const validateExtra = (extraName, product) => {
  try {
    if (!extraName || !product) {
      return { valid: false, message: "Invalid input data" };
    }

    // Normalize the extra name
    const normalizedExtraName = extraName.toLowerCase().trim();

    // Check if the product has extras
    if (!product.extras || !Array.isArray(product.extras) || product.extras.length === 0) {
      return { valid: false, message: "This product doesn't have any extras available" };
    }

    // Search for the extra in the product's extras
    for (const extra of product.extras) {
      const extraDbName = extra.name.toLowerCase().trim();

      // Check for exact match
      if (extraDbName === normalizedExtraName) {
        return { valid: true, extra: extra, exactMatch: true };
      }

      // Check for partial match
      if (extraDbName.includes(normalizedExtraName) || normalizedExtraName.includes(extraDbName)) {
        return {
          valid: true,
          extra: extra,
          exactMatch: false,
          message: `Found similar extra: ${extra.name}`
        };
      }
    }

    // Not found
    return { valid: false, message: "Extra not available for this product" };
  } catch (error) {
    console.error("Error validating extra:", error);
    return { valid: false, error: error.message };
  }
};

/**
 * Get all available products and categories from the menu
 * @param {Object} menuJSON - The complete menu data
 * @returns {Object} - Object with products and categories lists
 */
export const getMenuSummary = (menuJSON) => {
  try {
    const result = {
      categories: [],
      products: []
    };

    if (!menuJSON) {
      return result;
    }

    // Check if menu is array-based or object-based
    const categories = Array.isArray(menuJSON) ? menuJSON : menuJSON.categories;

    if (!categories) {
      return result;
    }

    // Process each category
    for (const category of categories) {
      const categoryName = Array.isArray(menuJSON) ? category.category : category.name;
      result.categories.push(categoryName);

      const products = Array.isArray(menuJSON) ? category.items : category.products;

      if (!products || !Array.isArray(products)) {
        continue;
      }

      // Process each product
      for (const product of products) {
        result.products.push({
          name: product.name,
          category: categoryName,
          price: product.price,
          hasExtras: product.extras && product.extras.length > 0
        });
      }
    }

    return result;
  } catch (error) {
    console.error("Error getting menu summary:", error);
    return { categories: [], products: [] };
  }
};