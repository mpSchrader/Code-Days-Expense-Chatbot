// Import required Bot Builder
const { ComponentDialog, WaterfallDialog, AttachmentPrompt, DialogContext, ChoicePrompt, TextPrompt, NumberPrompt } = require('botbuilder-dialogs');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var request = require('sync-request');

EXPENSE_DIALOGE_ID = 'newExpenseDialoge'
UPLOAD_PROMPT = 'uploadExpense'
AMOUNT_PROMPT = 'amountOfExpenseCheck'
PROMPT_RESPONE = 'textResponse'
NUMBER_PROMPT = 'promptNumber'

/**
 * Demonstrates the following concepts:
 *  Use a subclass of ComponentDialog to implement a multi-turn conversation
 *  Use a Waterfall dialog to model multi-turn conversation flow
 *  Use custom prompts to validate user input
 *  Store conversation and user state
 *
 * @param {String} dialogId unique identifier for this dialog instance
 */
class NewExpense extends ComponentDialog {

    constructor(dialogId) {
        super(dialogId);

        // validate what was passed in
        if (!dialogId) throw ('Missing parameter.  dialogId is required');

        this.addDialog(new WaterfallDialog(EXPENSE_DIALOGE_ID, [
            this.askForEpense.bind(this),
            this.confirmMerchant.bind(this),
            this.adjustMerchant.bind(this),
            this.confirmAmount.bind(this),
            this.adjustAmount.bind(this),
            this.confirmExpense.bind(this),
            this.storeResult.bind(this)
        ]));

        this.userSelectedPrice = 0;
        this.userSelectedMerchant = '';
        this.ocrResult = {
            numbers: [],
            texts: []
        }

        this.addDialog(new AttachmentPrompt(UPLOAD_PROMPT));
        this.addDialog(new ChoicePrompt(AMOUNT_PROMPT));
        this.addDialog(new TextPrompt(PROMPT_RESPONE));
        this.addDialog(new NumberPrompt(NUMBER_PROMPT));

    }

    /**
     * Waterfall Dialog step functions.
     *
     * Asks the user for an image of the expense.
     *
     * @param {WaterfallStepContext} step contextual information for the current step being executed
     */
    async askForEpense(step) {

        return await step.prompt(UPLOAD_PROMPT, 'Please upload an image of your expense.');
    }

    /**
     * Waterfall Dialog step functions.
     *
     * Runs OCR. After the result is in checks whether the merchant is correct.
     *
     * @param {WaterfallStepContext} step contextual information for the current step being executed
     */
    async confirmMerchant(step) {
        var url = step.context._activity.attachments[0].contentUrl;
        var answer = this.ocrOnImage(url);
        return await step.prompt(AMOUNT_PROMPT, 'Is "' + this.userSelectedMerchant + '" the correct merchant? If not, please type the correct name', ['Yes', 'No']);
    }

    /**
    * Waterfall Dialog step functions.
    *
    * Asks user to type in the correct merchant, if the merchant was incorrect extracted.
    *
    * @param {WaterfallStepContext} step contextual information for the current step being executed
    */
    async adjustMerchant(step) {
        if (step.result.value != 'Yes') {
            return await step.prompt(PROMPT_RESPONE, 'Please type the correct merchant name.');    
        } else {
            return step.next();
        }

    }

    /**
    * Waterfall Dialog step functions.
    *
    * Asks user to confirm the extracted amount.
    *
    * @param {WaterfallStepContext} step contextual information for the current step being executed
    */
    async confirmAmount(step) {
        if (step.result) {
            let lowerCaseName = step.result;
            // capitalize and set name
            this.userSelectedMerchant = lowerCaseName.charAt(0).toUpperCase() + lowerCaseName.substr(1);
        }
        return await step.prompt(AMOUNT_PROMPT, 'Is ' + this.userSelectedPrice + ' correct?', ['Yes', 'No']);

    }

    /**
    * Waterfall Dialog step functions.
    *
    * Asks user to write the right amount, if it was extracted incorrectly.
    *
    * @param {WaterfallStepContext} step contextual information for the current step being executed
    */
    async adjustAmount(step) {
        if (step.result.value == 'Yes') {
            return step.next();
        } else {
            var amounts = this.ocrResult.numbers;
            amounts.push('None')

            return await step.prompt(NUMBER_PROMPT, 'Please enter the correct amount.');
        }

    }

    /**
    * Waterfall Dialog step functions.
    *
    * User should confirm the expense information.
    *
    * @param {WaterfallStepContext} step contextual information for the current step being executed
    */
    async confirmExpense(step) {

        if (step.result) {
            let amount = step.result;
            this.userSelectedPrice = amount;
        }

        return await step.prompt(AMOUNT_PROMPT, 'Final check:\n Amount: ' + this.userSelectedPrice + '\n Merchant: ' + this.userSelectedMerchant + '\n Is this correct?',
            ['Yes', 'No']);
    }


    /**
    * Waterfall Dialog step functions.
    *
    * Prompts result of  waterfall dialog and ends it.
    *
    * @param {WaterfallStepContext} step contextual information for the current step being executed
    */
    async storeResult(step) {
        var answer = step.result.value;

        if (answer == 'Yes') {
            await step.prompt(PROMPT_RESPONE, 'Created Expense with for ' + this.userSelectedPrice + ' purchsed at ' + this.userSelectedMerchant+'.');

        } else if (answer == 'No') {
            await step.prompt(PROMPT_RESPONE, 'Please retry to create a new expense by typing "Create New Expense".');          
            
        }
        return await step.endDialog();
    }

    
    /**
     * Extracts the information from the expense image.
     * @param {String} imageURL
     */
    ocrOnImage(imageURL) {

        // Get image from bot server
        var res = request('GET', imageURL);
        var rawImage = res.body;

        // Post image to computer vision
        var ocrUrl = "https://westeurope.api.cognitive.microsoft.com/vision/v1.0/ocr";
        var ocrHeader = {
            'Content-Type': 'application/octet-stream',
            'Ocp-Apim-Subscription-Key': '<YourSubscriptionKey>',
            'User-Agent': 'Expense-Chatbot'
        }

        var ocrRes = request('POST', ocrUrl, {
            headers: ocrHeader,
            body: rawImage
        });

        var ocrResponse = JSON.parse(ocrRes.getBody('utf8'));

        this.ocrResult =
            {
            numbers: [],
            texts: [],
            match: []
            };

        // Analysis of the ocr response
        this.userSelectedPrice = -1.0;
        this.userSelectedMerchant = 'None'; 
        var numberReg = new RegExp('^[0-9]{1,}\\.[0-9]{2}$')
        var regions = []
        for (var i = 0; i < ocrResponse.regions.length; i++) {
            var box = ocrResponse.regions[i];

            
            for (var j = 0; j < box.lines.length; j++) {
                var lineText = "";
                var line = box.lines[j];
                for (var k = 0; k < line.words.length; k++) {

                    var text = line.words[k].text.trim();
                    //var isAmount = (/[0 - 9]+\.[0 - 9]{ 1, 2 }/gm).exec(text)
                    var isAmount = numberReg.test(text)
                    this.ocrResult.match.push({
                        text: text,
                        result: isAmount
                    });
                    if (isAmount) {
                        this.ocrResult.numbers.push(text)
                        var number = parseFloat("0"+text.replace(/[a-zA-Z\s]/, ''))
                        if (number > this.userSelectedPrice) {
                            this.userSelectedPrice = number
                        }

                    }
                    lineText += ' ' + text;
                }

                this.ocrResult.texts.push(lineText.trim());
            }
            
        }

        this.userSelectedMerchant = this.ocrResult.texts[0];
        this.userSelectedPrice = this.userSelectedPrice.toFixed(2);
        return this.ocrResult

    }

}

exports.NewExpenseDialog = NewExpense;