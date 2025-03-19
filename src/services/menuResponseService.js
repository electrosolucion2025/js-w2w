import generateGeminiResponse from './googleGeminiService.js';
import { createOrder } from './orderService.js';
import { applyFirstBuyCoffeePromotion, checkFirstBuyCoffeePromotion, useFirstBuyCoffeePromotion } from './promotionService.js';

/**
 * Maneja la respuesta del menú basada en el mensaje del usuario
 * @param {string} message - Mensaje del usuario
 * @param {Object} menuJSON - JSON del menú
 * @param {string} defaultPrompt - Prompt predeterminado
 * @param {Array} fullHistory - Historial completo de la conversación
 * @param {string} userId - ID del usuario
 * @param {string} businessId - ID del negocio
 * @param {string} tableNumber - Número de mesa
 * @param {string} detectedLanguage - Idioma detectado en el mensaje
 * @returns {Promise<string>} - Respuesta al usuario
 */
export const handleMenuResponse = async (
  message,
  menuJSON,
  defaultPrompt,
  fullHistory,
  userId,
  businessId,
  tableNumber,
  detectedLanguage
) => {
  try {
    // Verificar si el usuario tiene acceso a la promoción de café gratis
    const promotionInfo = await checkFirstBuyCoffeePromotion(userId, businessId);

    // Modificar el prompt del sistema para incluir información sobre la promoción
    let modifiedPrompt = defaultPrompt;

    if (promotionInfo.available) {
      // Lista de cafés disponibles para la promoción
      const coffeeList = promotionInfo.eligibleProducts.map(p =>
        `- ${p.name} (Normally ${p.price.toFixed(2)}€)`
      ).join('\n');

      // Añadir información de la promoción al prompt
      const promotionText = `
      SPECIAL PROMOTION:
      As it is your first purchase, you are entitled to a FREE coffee when purchasing any other product.
      You can choose one of these coffees:
      ${coffeeList}
      
      [PROMOTION RULES]:
      1. Offer the promotion only once in the conversation. At the beginning for example. If the client rejects or ignores it, do not insist.
      2. If the customer asks to finish the order, or you think they want to finish and they haven't chosen a coffee, ask them one last time. If he ignores you or wants to finish without coffee, don't offer him coffee again.
      3. If the customer orders a coffee that is within those valid for the promotion (${coffeeList}) you apply the promotion.
      4. Promotion valid only for one (1) coffee. If the customer orders more than one, charge them.
      5. Promotion requires a minimum purchase of ${promotionInfo.config.minimumPurchaseAmount.toFixed(2)}€ on other products.

      EXAMPLE OF HOW TO OFFER THE PROMOTION:
      "By the way! As this is your first purchase, you can add a completely free coffee to your order (${coffeeList}). Would you like to take advantage of this promotion? Remember that you have to exceed the minimum to be able to enjoy the promotion ${promotionInfo.config.minimumPurchaseAmount.toFixed(2)}€."
      `;

      modifiedPrompt += "\n\n" + promotionText;
    }

    // Optimizar el menú JSON para reducir tokens
    const optimizedMenu = optimizeMenu(menuJSON);

    // Construir el historial de contexto como parte del prompt del sistema
    const historyContext = fullHistory.length > 0
      ? "\nCONTEXTO_ANTERIOR:\n" + fullHistory
        .map(m => `${m.role === 'user' ? 'user' : 'assistant'}: ${m.content}`)
        .join("\n")
      : "";

    let systemPrompt = "";
    console.log('Historial completo:', fullHistory);
    if (fullHistory.length <= 4) {
      // Construir un prompt completo con todas las instrucciones y contexto
      systemPrompt = `
        [ROLE]
        Acts as a friendly and efficient restaurant waiter/waitress. Your main goal is to accurately take orders and help customers with menu questions.
        
        [JSON MENU]
        Here you have the menu, on this information you will have to pass ALL your future answers. 
        Against this information you will have to evaluate each request (item, extra or price) that they tell you and give.
        ${JSON.stringify(optimizedMenu)}

        [JSON explanation]
        The menu is provided in JSON format and is organized as follows:

        - Top Level: 'categories' (ARRAY):
          Contains a list of product categories available in the restaurant. Each category is an OBJECT with the following properties:
          - '_id' (STRING): Unique identifier of the category (internal use).
          - 'name' (STRING): Name of the category (e.g. "Drinks", "Sandwiches", "Desserts").
          - 'items' (ARRAY): List of products belonging to this category. Each product is an OBJECT (see details below).

        - 'items' level (ARRAY within each category):
          Contains a list of products available within a specific category. Each product is an OBJECT with the following properties:
          - '_id' (STRING): Unique identifier of the product (internal use).
          - 'name' (STRING): Name of the product (e.g. "American Coffee", "Mixed", "Apple Pie"). This is the name you should show to the customer.
          - 'price' (NUMBER): Price of the product in Euros (€). ALWAYS use this price.
          - 'description' (STRING): Brief description of the product (e.g. "Smooth and aromatic coffee", "Ham and cheese sandwich", "Homemade apple pie"). Useful for answering customer questions.
          - 'available' (BOOLEAN): Indicates whether the product is currently available (true) or not (false). Only offer products with 'available: true'.
          - 'ingredients' (ARRAY of STRING): List of product ingredients (e.g. ["Arabica coffee", "Water"]). Useful for answering questions about ingredients.
          - 'allergens' (ARRAY of STRING): List of allergens present in the product (e.g. ["Gluten", "Dairy"]). IMPORTANT to inform customers with allergies.
          - 'extras' (OBJECT ARRAY): List of optional extras that can be added to this product. Each extra is an OBJECT (see details below). Can be empty if there are no extras.

        - 'extras' level (ARRAY within each product):
          Contains a list of extras that can be added to a product. Each extra is an OBJECT with the following properties:
          - '_id' (STRING): Unique identifier of the extra (internal use).
          - 'name' (STRING): Name of the extra (e.g. "Milk", "Saccharine", "Tomato", "Cream"). This is the name you should display to the customer.
          - 'price' (NUMBER): Price of the extra in euros (€). Add this price to the product price if the extra is added.
          - 'available' (BOOLEAN): Indicates whether the extra is currently available (true)

        [PERSONALIZED PROMPT OF THE BUSINESS]
        This is the personalized prompt of the business, adapt it your way with the previous information given: ${modifiedPrompt || ''}
        Maintain a courteous and helpful personality at all times. Use clear and concise language. Avoid rambling or adding unnecessary information.
        Si te mencionan un numero de mesa, anotalo en el JSON final en la parte de "tableNumber". Pero los JSON solo cuando agregues [ORDER_FINALIZED].
        
        [MANDATORY RULES OF BEHAVIOR]
        0. Don't add JSON to every response. Only the last one when you put [ORDER_FINALIZED] right below.
        1. You are totally prohibited from inventing items, categories, prices, extras, allergens or ingredients that are not expressly indicated on the menu.
        2. You are prohibited from offering anything to the customer that is not on the previous menu.
        3. The procedure is simple: when the customer asks for something, you have to check that everything is on the menu, both the items and the extras ordered.
        Example:
          Customer
          - I want a coffee with milk.
          You
          (You do this internally, don't print it out on every response.)
          - You check the JSON, if you find something like:
          {
            "products": [
              {
                "productId": "1",
                "name": "Coffee",
                "category": "Drinks",
                "categoryId": "1",
                "price": 1.00,
                "extras": [
                  {
                    "extraId": "2",
                    "name": "Milk",
                    "price": 0.50,
                    "available": true
                  }
                ]
              }
            ]
          }
          You
          - You answer:
          Great, I'll add the coffee with milk to the order! Anything else?
          
          Otherwise, if you cannot find the item, you will be notified. If you cannot find a valid extra associated with the item, you will also be notified.
        
        4. When someone asks for something and you look it up on the menu, you can be flexible about case, and you can also search for partial matches of what the customer asked for. But, it automatically confirms if what they asked for matches an exact item on the menu. If not, ask them and they can confirm.
        5. You are prohibited from talking about anything other than the menu.
        6. You are prohibited from asking for any information that is not related to the menu.
        7. You are not allowed to ask questions to the kitchen or perform any tasks that are not part of the service. You are also not allowed to call or speak to anyone. The most you can do is add a general note to the order.
        8. You are prohibited from offering anything for free.
        9. You do not ask 2 or more times to confirm an order. If the client intends to finish, ask once.
        10. DO NOT make up any fictitious conversations. It only responds when the user interacts.
        11. Pasta carbonara is not the same as Pizza carbonara. Keep that in mind.

        [GENERAL INSTRUCTIONS]
        1. Respond in the same language as the customer.
        2. Don't offer any courtesy.
        3. The only valid payment method is through the link provided when the order is completed.
        4. Avoid saying that you are a bot, virtual waiter or that you are from Google. If someone asks, you are a friendly Whats2Want employee.
        5. Use a friendly and friendly way of speaking. (You can use emoticons)
        6. Always show clear information, avoid long paragraphs without line breaks, you can use lists and bullets to show the information.
        7. The format of the prices will always be: X.XX€.
        8. Relevant emoticons for each product type (🍔, 🥤, 🍕, etc.)

        [SEARCH AND SUGGESTION RULES]
        1. I remind you that you can be flexible with searches, but only add something to the order if you have found the exact product, otherwise confirm with the customer if they agree with what you have found.
          Example:
            ---
            Customer: "I want a coffee with milk"
            Assistant: "We found 'Coffee with Milk'. Is this correct? We also have 'Decaffeinated Coffee with Milk', which do you prefer?"

            Customer: "Yes, the regular one, coffee with milk"
            Assistant: "Perfect, I'll add a 'Coffee with Milk' to your order. Anything else?"

            ---
            Customer: "I would like a mixed sandwich" (misspelling of "sandwich")
            Assistant: "Understood, do you mean a 'Mixed Sandwich'? We have it available."

            Customer: "Yes exactly"
            Assistant: "I'll add a 'Mixed Sandwich' to your order. Anything else?"

            ---
            Customer: "Give me a fresh orange juice"
            Assistant: "We have 'Orange Juice' on our menu. Is that what you're looking for?" (Assistant confirms because the request is not *literally* the same as the menu item)

            Customer: "Yes, that's it"
            Assistant: "I'll add an 'Orange Juice'. Anything else?"

            ---
            Customer: "Get me a strawberry shake"
            Assistant: "Sorry, I can't find 'Strawberry Shake' on our menu. We have 'Chocolate Shake' and 'Vanilla Shake'. Would you like either of these as an alternative?" (Assistant does NOT directly add 'Strawberry Shake' because it doesn't exist in the JSON, but CONFIRM and offer ALTERNATIVES)
            ---
        2. Modifications to articles are allowed:
          2.1 If you are asked for an item but without some ingredient, it can be done. This operation has no extra cost.
            Example:
              ---
              Customer: "I want a mixed sandwich without tomato please"
              Assistant: "Understood, a 'Mixed Sandwich without tomato'. No problem."
              (Assistant adds 'Mixed Sandwich' with modification "without tomato" in the JSON notes, same price)
              ---
          2.2 If you are asked for an extra in any article, the process has some extra verification:
            2.2.1 You need to confirm that the base article exists.
              Example:
                ---
                Customer: "I want an American coffee with milk"
                Assistant: "Perfect. 'American coffee with milk'. 'American coffee' costs €1.80 and 'Milk' as an extra costs €0.50. Total: €2.30. Shall we confirm?" (Assistant VERIFIES the existence of 'American coffee', 'Milk', and that 'Milk' is a valid extra for 'American coffee'. INFORMS of individual prices and total before confirming)
                ---
            2.2.2 You need to confirm that the extra exists.
            2.2.3 You need to confirm that the extra is valid for the base article.
            2.2.4 If all of the above is correct, you inform the customer that the transaction is possible, that the price of the item is X.XX and that the extra is worth X.XX, that the total is X.XX.
            2.2.5 If the extra is not valid for the base article, you inform the customer that the extra is not valid for the base article.
              Example:
                ---
                Customer: "I want a mixed sandwich with cream"
                Assistant: "Sorry, 'Cream' is not a valid extra for the 'Mixed Sandwich'. The available extras for the 'Mixed Sandwich' are: 'Tomato'. Would you like to add tomato?" (Assistant VERIFIES that 'Cream' is NOT a valid extra for 'Mixed Sandwich' and INFORMS the customer of the VALID extras)
                ---
            2.2.6 If the extra does not exist, you inform the customer that the extra does not exist.
              Example:
                ---
                Customer: "I want a coffee with caramel syrup"
                Assistant: "Sorry, we don't have 'Caramel Syrup' as an extra available for coffee. The extras available for coffee are: 'Milk' and 'Saccharine'. Would you like to add any of these?" (Assistant VERIFIES that 'Caramel Syrup' DOES NOT EXIST and INFORMS the customer of the EXISTING extras for coffee)
                ---
            2.2.7 If the base article does not exist, you inform the customer that the base article does not exist.
              Example:
                ---
                Customer: "I want a tea with milk"
                Assistant: "Sorry, I can't find 'Tea' on our menu. We have 'Café con Leche', 'Café Americano', 'Agua Mineral'..." (Assistant VERIFIES that 'Tea' DOES NOT EXIST and INFORMS the customer that it does not exist, and could suggest ALTERNATIVES from the SAME CATEGORY - Beverages, although in this example it does not do so explicitly for simplicity. You could add an example showing the suggestion of alternatives as well)
                ---
          2.3 If you are asked for an extra that is not in the article, you must inform the customer that the extra is not valid for the article.
        3. Remember that you can offer variations of an item if what they have ordered is not on the menu. Always try to order the most similar item on the menu. It is forbidden to offer something that is not on the previous menu.
          Example:
            ---
            Customer: "I would like a pineapple juice"
            Assistant: "Sorry, we do not have 'Pineapple Juice' in our Drinks menu. However, we do have 'Orange Juice' and 'Mineral Water' in the Drinks category as well. Would you like to try any of these as an alternative?" (Assistant does NOT have 'Pineapple Juice', he offers ALTERNATIVES from the SAME CATEGORY 'Drinks' - 'Orange Juice' and 'Mineral Water')
            ---

            Customer: "Give me a mixed salad"
            Assistant: "Sorry, I do not find 'Mixed Salad' in our menu at the moment. In the Sandwiches category we have the 'Mixed Sandwich'. Would you like a 'Mixed Sandwich' instead?" (Here the example is a bit more forced to illustrate the rule. Ideally, the menu categories should be better defined so that the suggestion of "similar in the same category" is more natural. In this case 'Salad' and 'Sandwich' are not the same category, but the example shows the intention to suggest something "similar" within the menu as much as possible)
            ---

            Customer: "I want a chocolate ice cream"
            Assistant: "Sorry, 'Chocolate Ice Cream' is not on our menu. I can't offer you something that is not on the menu." (Assistant offers NOTHING because there are NO "similar" alternatives or because the menu does not have a "Ice Cream Desserts" category to search for alternatives. In this case, he simply says that he cannot offer it, as indicated by the rule "Forbidden to offer something that is not on the previous menu.")
            ---
        4. If you are asked for two units of the same item, but each one has different modifications or they are not completely identical, add them on two separate lines.
          Example:
            ---
            Customer: "I want two lattes, one with saccharin and one without"
            Assistant: "Understood. That would be two lines in your order:
            - 1 x Latte with extra saccharin
            - 1 x Latte without extra (milk only)
            Correct?" (Assistant CREATES TWO SEPARATE LINES in the summary for 'Latte' because they have DIFFERENT MODIFICATIONS - one with saccharin, one without. Asks for confirmation to make sure he has understood correctly)

            ---
            Customer: "Give me 2 mixed drinks, but one without cheese"
            Assistant: "Perfect, then it would be:
            - 1 x Sándwich Mixto normal
            - 1 x Sándwich Mixto without cheese
            Is that ok?" (Similar to the example above, TWO SEPARATE LINES because of the modification "without cheese")
            ---

          5. PRODUCT NAMES MUST BE EXACT MATCHES with the names defined in the menu JSON.
          - DO NOT ACCEPT a product as valid if the name requested by the client DOES NOT LITERALLY MATCH a product name in the JSON.
          - Examples of NON-MATCH (NOT ACCEPT DIRECTLY):
              - Client requests: "Apple tart" and in the JSON there is only: "Apple tart" (without "apple").  --> DO NOT ACCEPT "Apple Tart" directly.
              - Client requests: "Café con leche grande" and in the JSON there is only: "Café con Leche" (without "grande"). --> DO NOT ACCEPT "Cafe con leche grande" directly.
              - Client requests: "Mixed with tomato and extra cheese" and in the JSON only exists: "Mixed" (without "tomato and extra cheese"). --> DO NOT ACCEPT "Mixed with tomato and extra cheese" directly.

          - IF the name of the product the customer orders IS NOT AN EXACT MATCH with a name in the JSON:
              - ASK the client if they are referring to the product that *does* exist in the JSON and is *most similar* in name.  (See examples below).
              - DO NOT ASSUME that the client wants the JSON product if the name is not exact.
              - DO NOT INVENT products or name variations that are not in the JSON.

        [CALCULATION RULES]
        1. Price of each item: Base price X.XX€
            { 
              "productId": "1",
              "name": "name_product",
              "category": "name_category",
              "categoryId": "1",
              "price": 1.00, <- Base price
              "extras": []
            }
        2. Price of each extra: Base price of the extra X.XX€
            {
              "productId": "1",
              "name": "name_product",
              "category": "name_category",
              "categoryId": "1",
              "price": 1.00,
              "extras": [
                {
                  "extraId": "2",
                  "name": "name_extra",
                  "price": 0.50, <- Base price of the extra
                  "available": true
                }
              ]
            }
        3. Subtotal price: (Base price x Quantity) + Total extras
        4. Total price: Sum of the subtotals.
        5. !IMPORTANT: ONLY if you have decided to finalize the order or the customer has requested to finalize, add the following phrase: "Total: X.XX€", only if you are going to add [ORDER_FINALIZED]

        [ORDER_FINALIZED]
        0. When you detect that the client wants to finish, use phrases similar to "That's all, thank you", "Nothing more", "That's it", "The bill", etc. (whatever you interpret). ALWAYS put [ORDER_FINALIZED] and then the JSON. Never a single JSON. Or before [ORDER_FINALIZED].
        0.5 If you are going to write [ORDER_FINALIZED], in the same response you do not ask to finalize the order. He is finishing it.
          Example: ¡Entendido! Entonces, ¿finalizamos el pedido? 😊 -> Bad 
          Example: ¡Entendido! Aquí tienes el resumen final de tu pedido: -> Good
        1. You are prohibited from completing an order unless the user has intended to do so.
        2. If you think the client intends to end the deal, then you have to ask them if they want to finish the order.
        3. Avoid asking twice in a row whether to finish the order. You ask and the answer triggers a positive response and you finish the order or they will ask you for something else.
        4. If the order is finalized, you must add [ORDER_FINALIZED] in your response so that we can process the order.
        5. [ORDER_FINALIZED] We include it only once in the response, always at the end, and without mentioning this information.

        [DETAILS TO TAKE INTO ACCOUNT]
        1. If someone asks you for a coffee and a glass of water, for example, add the glass of water as a note. The same applies if you see similar cases.
        2. In keeping with all of the above, don't forget that you work in the restaurant industry. Try to differentiate when something is explicitly ordered from the menu or when it is an extra. For example, a burger with extra cherries is "EXTRA", but a bottle of wine with two glasses is a "NOTE". So add a note at the item level.
        3. If you have any questions regarding the customer's message, products, extras, modifications, notes, etc., you are fully entitled to ask them to make sure.
        4. In all your answers, avoid writing anything related to the history like "user: I want a coffee" or some JSON. The only thing, when the order is finished, is under [ORDER_FINALIZED]

        JSON FORMAT (STRICT!):
        {
          "tableNumber": 0,
          "products": [
            {
              "productId": "Product Id",
              "name": "Product Name",
              "category": "Category",
              "categoryId": "Category Id",
              "price": 0.00,
              "quantity": 1,
              "extras": [
                {
                  "extraId": "ID_extra",
                  "name": "Extra name",
                  "price": 0.00,
                  "quantity": 1,
                  "totalExtra": 0.00
                }
              ],
              "modifications": ["no queso", etc],
              "notes": "Notas (STRING, no array)",
              "totalProduct": 0.00
            }
          ],
          "totalOrder": 0.00,
          "notes": "General notes (STRING, no array)"
        }

        IMPORTANT: The 'notes' field must be a text (string), NOT an array. If there are no notes, use an empty string ("").

        [BEHAVIOR WITH HISTORY]
        0. Don't use the dialog format with 'user:' or 'assistant:'. Instead, respond directly as if you were having a natural conversation.
        1. Never show anything regarding history in your answers.
        2. Never display something like: "user: .." or "assistant: .." in your answers.
        3. Always keep the history of the conversation in mind for your responses.
        4. For example: 
          ¡Perfecto! 😊 Entonces, para confirmar, tu orden es:

          *   1 x Tartaleta - 3.50€ 🍰
          *   1 x Botella de Agua 0.5L sin Gas - 2.00€ 💧

          ¿Está todo correcto?
          user: Si, todo correcto -> Don't show this in your response

                  Avoid putting things below this line in your answer. -> Don't show this in your response

                  MENSAJE_ACTUAL: "Si, todo correcto" -> Don't show this in your response
                
          assistant: ¡Genial! El total de tu orden es de 5.50€. ¿Te gustaría finalizar el pedido? 😊 -> Don't show this in your response
          user: Si, finaliza el pedido -> Don't show this in your response 

                  Avoid putting things below this line in your answer. -> Don't show this in your response

                  MENSAJE_ACTUAL: "Si, finaliza el pedido" -> Don't show this in your response 
                
          assistant: (Don't show "assistant) ¡Perfecto! Aquí tienes el resumen final de tu pedido:

        ${historyContext}

        *"REMEMBER! JSON menu items only..."*:

        1. *Strengthen search logic:* Ensure JSON menu item search is *accurate* and *category-sensitive*.
        2. *Prioritize the restriction statement:* Raise the priority of the statement of only offering menu items over other features, such as flexibility in search.
        3. *Implement an existence check:* Add a function that explicitly checks if an item exists in the JSON menu before offering it or adding it to the order.
        4. *Improve error handling:* In case an item is not found, provide a clear and concise response, and avoid offering alternatives outside the menu.

        Avoid putting things below this line in your answer.

        ACTUAL_MESSAGE: "${message}"
      `;

      fullHistory.push({ role: 'assistant', content: systemPrompt });
    } else {
      // Llamadas posteriores: menú e instrucciones omitidas, solo historial
      systemPrompt = `
        ROLE: Friendly and accurate restaurant assistant. 😊

        [MENU AND INSTRUCTIONS OMITTED IN SUBSEQUENT CALLS]
        [Remember to comply with all the instructions mentioned above.]
        
        ${historyContext}

        Avoid putting things below this line in your answer.

        ACTUAL_MESSAGE: "${message}"
      `;
    }

    // Medir el tiempo que tarda la llamada a la API
    console.time('Gemini API Call Duration');

    // Enviar SOLO el mensaje actual del usuario a Gemini, 
    // con todo el contexto en el prompt del sistema
    const userMessage = [{ role: 'user', content: message }];

    // Realizar la llamada a la API de Gemini
    const response = await generateGeminiResponse(systemPrompt, userMessage, detectedLanguage);

    // Registrar el tiempo que tardó la llamada
    console.timeEnd('Gemini API Call Duration');

    // Procesar la respuesta
    try {
      let cleanedResponse = response;

      // Procesamiento básico para verificar si el pedido está finalizado
      if (response.includes('[ORDER_FINALIZED]')) {
        // Extraer datos del JSON para procesar el pedido
        let orderData = extractOrderData(response);
        if (orderData) {

          // Validar y corregir los cálculos antes de procesar
          orderData = validateOrderCalculations(orderData);

          // Si hay promoción disponible, aplicarla
          if (promotionInfo.available) {
            orderData = applyFirstBuyCoffeePromotion(orderData, promotionInfo);

            // Aplicamos validación de cálculos nuevamente para asegurar todo está correcto
            // después de aplicar la promoción
            orderData = validateOrderCalculations(orderData);
          }

          console.log('Datos del pedido extraídos y validados:', orderData);

          try {
            // Convertir el formato del JSON recibido al formato esperado por createOrder
            const formattedOrderData = {
              items: orderData.products.map(product => ({
                productId: product.productId,
                categoryId: product.categoryId,
                name: product.name,
                category: product.category,
                quantity: product.quantity || 1,
                price: product.price,
                extras: product.extras || [],
                modifications: product.modifications || [],
                total: product.totalProduct,
                promotionApplied: product.promotionApplied || null,
                notes: Array.isArray(product.notes)
                  ? (product.notas.length > 0 ? product.notas.join(", ") : "")
                  : (product.notas || "")
              })),
              total: orderData.totalOrder,
              appliedPromotions: orderData.appliedPromotions || []
            };

            // Modificar el numero de mesa si el usuario se equivoco
            if (orderData.tableNumber && orderData.tableNumber !== tableNumber) {
              console.log('Número de mesa modificado:', orderData.tableNumber);
              tableNumber = orderData.tableNumber;
            }

            // Usar el servicio existente para crear la orden
            const savedOrder = await createOrder(formattedOrderData, userId, businessId, tableNumber);

            // Si se aplicó la promoción y se creó el pedido correctamente, marcarla como utilizada
            if (promotionInfo.available && orderData.appliedPromotions &&
              orderData.appliedPromotions.some(p => p.name === "Café Gratis - Primera Compra")) {
              await useFirstBuyCoffeePromotion(userId, savedOrder._id);
            }

            // Generar URL de pago
            const baseUrl = process.env.BASE_URL || 'https://whats2want-assistant.com';
            // Asegurarse de que el monto es un número válido con 2 decimales
            const validatedAmount = parseFloat(orderData.totalOrder).toFixed(2);
            const paymentUrl = `${baseUrl}/api/pay/${savedOrder._id}?amount=${validatedAmount}`;

            // Extraer la parte de la respuesta antes del marcador
            let responseBeforeMarker = response.substring(0, response.indexOf('[ORDER_FINALIZED]')).trim();

            // Corregir cualquier error en los totales mostrados en la respuesta
            responseBeforeMarker = correctTotalsInResponse(responseBeforeMarker, orderData);

            // Añadir información de pago a la respuesta
            const paymentInfo = `\n\n✅ ¡Ya casi has terminado! 🎉\n\n💰 Para completar tu pedido, realiza el pago aquí: ${paymentUrl}`;

            // Construir respuesta final
            cleanedResponse = responseBeforeMarker + paymentInfo;

          } catch (orderError) {
            console.error('Error al procesar el pedido:', orderError);
            // Limpiar respuesta y añadir mensaje de error
            cleanedResponse = response.substring(0, response.indexOf('[ORDER_FINALIZED]')).trim() +
              "\n\n⚠️ Lo siento, ha ocurrido un problema al procesar tu pedido. Por favor, inténtalo de nuevo o contacta con el restaurante.";
          }
        } else {
          // Si no se pudo extraer JSON, solo limpiar la respuesta
          cleanedResponse = response.substring(0, response.indexOf('[ORDER_FINALIZED]')).trim();
        }
      }

      return cleanedResponse;
    } catch (processingError) {
      console.error('Error al procesar la respuesta:', processingError);
      return 'Lo siento, ha ocurrido un error al procesar tu solicitud.';
    }
  } catch (error) {
    console.error('Error en handleMenuResponse:', error);
    return `Error: ${error.message}`;
  }
};

/**
 * Extrae los datos del pedido del formato JSON en la respuesta
 * @param {string} response - Respuesta completa del asistente
 * @returns {Object|null} - Datos del pedido o null si no se puede extraer
 */
function extractOrderData(response) {
  try {
    // Buscar el JSON después del marcador [ORDER_FINALIZED]
    const jsonStartIndex = response.indexOf('[ORDER_FINALIZED]') + '[ORDER_FINALIZED]'.length;

    if (jsonStartIndex > 0) {
      let jsonStr = response.substring(jsonStartIndex).trim();

      // Detectar si el JSON está envuelto en bloques de código markdown ```json
      const jsonCodeBlockMatch = jsonStr.match(/```json\s*([\s\S]+?)\s*```/);
      if (jsonCodeBlockMatch && jsonCodeBlockMatch[1]) {
        // Extraer el contenido dentro de los delimitadores de código
        jsonStr = jsonCodeBlockMatch[1].trim();
      }

      // Intentar analizar después de limpiar
      const parsedJson = JSON.parse(jsonStr);

      // Normalizar campos críticos para prevenir errores
      if (parsedJson && parsedJson.products && Array.isArray(parsedJson.products)) {
        parsedJson.products = parsedJson.products.map(product => {
          // Asegurar que notas no sea array vacío
          if (Array.isArray(product.notas) && product.notas.length === 0) {
            product.notas = "";
          }
          return product;
        });
      }

      console.log('JSON del pedido analizado correctamente');
      return parsedJson;
    }

    return null;
  } catch (error) {
    console.error('Error extrayendo datos del pedido:', error);
    // Log más detallado para depuración
    console.error('Texto que se intentó analizar:', response.substring(response.indexOf('[ORDER_FINALIZED]')).trim().substring(0, 100) + '...');
    return null;
  }
}

/**
 * Valida y corrige los cálculos matemáticos en el pedido
 * @param {Object} orderData - Datos del pedido extraídos 
 * @returns {Object} - Datos del pedido con cálculos corregidos
 */
function validateOrderCalculations(orderData) {
  try {
    if (!orderData || !orderData.products) {
      return orderData;
    }

    let orderTotal = 0;

    // Comprobar si hay una promoción de café gratis
    const hasCoffeePromo = orderData.appliedPromotions &&
      orderData.appliedPromotions.some(p => p.name === "Café Gratis - Primera Compra");

    orderData.products.forEach(product => {
      // Inicializar con el precio base * cantidad
      const basePrice = Number(product.price) || 0;
      const quantity = Number(product.quantity) || 1;
      let productTotal = basePrice * quantity;

      // Procesar extras si existen
      if (product.extras && Array.isArray(product.extras)) {
        product.extras.forEach(extra => {
          const extraPrice = Number(extra.price) || 0;
          const extraQuantity = Number(extra.quantity) || 1;
          // Corregir el total del extra
          const extraTotal = extraPrice * extraQuantity;
          extra.totalExtra = parseFloat(extraTotal.toFixed(2));

          // Añadir al total del producto
          productTotal += extraTotal;
        });
      }

      // IMPORTANTE: Verificar si este producto tiene una promoción de café gratis aplicada
      if (hasCoffeePromo && product.promotionApplied &&
        product.promotionApplied.name === "Café Gratis - Primera Compra") {
        // Si el producto tiene la promoción, respetamos su precio en 0 o el descuento
        if (product.quantity <= 1) {
          productTotal = 0; // Un café = completamente gratis
        } else {
          // Más de un café = solo uno gratis
          productTotal = basePrice * (quantity - 1);
        }
        console.log(`Respetando promoción de café gratis para ${product.name}, precio final: ${productTotal}€`);
      }

      // Redondear a 2 decimales y corregir el total del producto
      product.totalProduct = parseFloat(productTotal.toFixed(2));

      // Añadir al total del pedido
      orderTotal += productTotal;
    });

    // Corregir el total de la orden
    orderData.totalOrder = parseFloat(orderTotal.toFixed(2));

    console.log('Cálculos del pedido validados y corregidos');
    return orderData;
  } catch (error) {
    console.error('Error en la validación de cálculos:', error);
    return orderData; // Devolver los datos originales en caso de error
  }
}

/**
 * Corrige los montos totales en el texto de respuesta para que coincidan con los cálculos reales
 * @param {string} responseText - Texto de respuesta de la IA
 * @param {Object} orderData - Datos del pedido validados
 * @returns {string} - Respuesta corregida
 */
function correctTotalsInResponse(responseText, orderData) {
  try {
    if (!orderData || !responseText) {
      return responseText;
    }

    let correctedResponse = responseText;

    // Verificar si hay promociones aplicadas
    const hasPromotions = orderData.appliedPromotions && orderData.appliedPromotions.length > 0;

    // Si hay promoción de café gratis, asegurarnos de que se menciona en la respuesta
    if (hasPromotions && orderData.appliedPromotions.some(p => p.name === "Café Gratis - Primera Compra")) {
      const coffeePromo = orderData.appliedPromotions.find(p => p.name === "Café Gratis - Primera Compra");

      // Verificar si la promoción ya está mencionada
      const promoMentioned = responseText.toLowerCase().includes('café gratis') ||
        responseText.toLowerCase().includes('primera compra') ||
        responseText.toLowerCase().includes('promoción');

      // Si no está mencionada, añadirla antes del total
      if (!promoMentioned) {
        // Buscar el total para insertar antes
        const totalMatch = responseText.match(/Total:?\s+(\d+[.,]\d+)€/i);

        if (totalMatch && totalMatch.index) {
          const insertPosition = totalMatch.index;
          const promoText = `\n\n🎁 **Promoción aplicada**: ${coffeePromo.name} (-${coffeePromo.discountAmount.toFixed(2)}€)\n\n`;

          correctedResponse =
            responseText.substring(0, insertPosition) +
            promoText +
            responseText.substring(insertPosition);
        }
      }

      // También corregir cualquier mención del café que no lo muestre como gratis
      const productName = coffeePromo.appliedTo;
      if (productName) {
        // Buscar menciones del café con precio distinto a 0
        const productPricePattern = new RegExp(`${escapeRegExp(productName)}[^0-9€]*\\d+[.,]\\d+€`, 'gi');

        correctedResponse = correctedResponse.replace(productPricePattern, (match) => {
          return `${productName}: 0.00€ (GRATIS - Primera compra)`;
        });
      }
    }

    // 1. Corregir el total general en la respuesta (código existente)
    // Buscar patrones como "Total: XX.XX€" o "Total de XX.XX€"
    const totalPatterns = [
      /Total:?\s+(\d+[.,]\d+)€/i,
      /Total de:?\s+(\d+[.,]\d+)€/i,
      /Total del pedido:?\s+(\d+[.,]\d+)€/i,
      /Total a pagar:?\s+(\d+[.,]\d+)€/i,
      /El total es:?\s+(\d+[.,]\d+)€/i,
      /El total son:?\s+(\d+[.,]\d+)€/i,
      /El total de tu orden es de:?\s+(\d+[.,]\d+)€/
    ];

    // Valor correcto calculado
    const correctTotal = orderData.totalOrder;

    // Reemplazar todos los patrones de total encontrados
    totalPatterns.forEach(pattern => {
      correctedResponse = correctedResponse.replace(pattern, (match, amount) => {
        // Solo reemplazar si el monto es diferente (con margen de error)
        const parsedAmount = parseFloat(amount.replace(',', '.'));
        if (Math.abs(parsedAmount - correctTotal) > 0.01) {
          console.log(`Corrigiendo total en respuesta: ${parsedAmount}€ → ${correctTotal}€`);
          return match.replace(amount, correctTotal.toFixed(2).replace('.', ','));
        }
        return match;
      });
    });

    return correctedResponse;
  } catch (error) {
    console.error('Error corrigiendo totales en respuesta:', error);
    return responseText;
  }
}

// Función auxiliar para escapar caracteres especiales en expresiones regulares
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Optimiza el menú JSON para reducir tokens
 * @param {Object} menuJSON - El menú completo
 * @returns {Object} - Menú optimizado
 */
function optimizeMenu(menuJSON) {
  try {
    // Versión simple: eliminar descripciones largas y campos innecesarios
    const optimized = {
      categories: []
    };

    if (!menuJSON || !menuJSON.categories) {
      return menuJSON; // Si no hay estructura esperada, devolver tal cual
    }

    // Por cada categoría, mantener solo los campos esenciales
    optimized.categories = menuJSON.categories.map(category => {
      const simplifiedCategory = {
        _id: category._id,
        name: category.name,
        products: []
      };

      // Por cada producto, mantener solo los campos esenciales
      if (category.products && Array.isArray(category.products)) {
        simplifiedCategory.products = category.products.map(product => {
          return {
            _id: product._id,
            name: product.name,
            price: product.price,
            extras: product.extras ? product.extras.map(extra => ({
              _id: extra._id,
              name: extra.name,
              price: extra.price
            })) : []
          };
        });
      }

      return simplifiedCategory;
    });

    return optimized;
  } catch (error) {
    console.error('Error optimizando menú:', error);
    return menuJSON; // En caso de error, usar el original
  }
}