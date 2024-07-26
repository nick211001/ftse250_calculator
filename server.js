const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const xlsx = require("xlsx");
const csv = require("csv-parser");

// Helper function to read Excel files
function readExcelFile(filePath, sheetName) {
  console.log(`Reading Excel file from: ${filePath}`);
  const workbook = xlsx.readFile(filePath);
  console.log(`Workbook loaded: ${workbook.SheetNames}`);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.error(`Sheet ${sheetName} not found in file ${filePath}`);
    return [];
  }
  return xlsx.utils.sheet_to_json(sheet);
}

// Helper function to read CSV files
function readCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (err) => reject(err));
  });
}

// Discounted Cash Flow calculation function
function calculateDCF(freeCashFlows, discountRate, perpetualGrowthRate) {
  let dcfValue = 0;
  const n = freeCashFlows.length;

  // Calculate the present value of each year's free cash flow
  for (let i = 0; i < n; i++) {
    dcfValue += freeCashFlows[i] / Math.pow(1 + discountRate, i + 1);
  }

  // Calculate the terminal value
  const terminalValue =
    (freeCashFlows[n - 1] * (1 + perpetualGrowthRate)) /
    (discountRate - perpetualGrowthRate);
  dcfValue += terminalValue / Math.pow(1 + discountRate, n);

  return dcfValue;
}

// Create Express app
const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

// Endpoint to handle calculation
app.post("/calculate", async (req, res) => {
  const { desiredReturn, marginOfSafety } = req.body;

  try {
    const freeCashFlowData = readExcelFile(
      "companies_full_list.xlsx",
      "Sheet1"
    );
    const perpetualGrowthRates = readExcelFile(
      "perpetual_growth_rate.xlsx",
      "Sheet1"
    );
    const marketValues = await readCSVFile("ftse250_companies.csv");

    // Debug: Log the data read from files
    console.log("Free Cash Flow Data:", freeCashFlowData);
    console.log("Perpetual Growth Rates:", perpetualGrowthRates);
    console.log("Market Values:", marketValues);

    const results = [];

    freeCashFlowData.forEach((company) => {
      const companyName = company.Company;
      console.log(`Processing company: ${companyName}`);
      console.log("Company data:", company);

      const freeCashFlows = [
        company["Year 1 FCF"],
        company["Year 2 FCF"],
        company["Year 3 FCF"],
        company["Year 4 FCF"],
        company["Year 5 FCF"],
        company["Year 6 FCF"],
        company["Year 7 FCF"],
        company["Year 8 FCF"],
        company["Year 9 FCF"],
        company["Year 10 FCF"],
      ];

      // Debug: Log the free cash flows
      console.log(`Free Cash Flows for ${companyName}:`, freeCashFlows);

      // Check if any free cash flow value is undefined
      if (freeCashFlows.some((value) => value === undefined)) {
        console.error(
          `Missing free cash flow data for company: ${companyName}`
        );
        return;
      }

      const freeCashFlowsNumbers = freeCashFlows.map(Number);
      console.log(
        `Free Cash Flows Numbers for ${companyName}:`,
        freeCashFlowsNumbers
      );

      const growthRateData = perpetualGrowthRates.find(
        (rate) => rate.Company === companyName
      );
      if (!growthRateData) {
        console.error(
          `Perpetual growth rate not found for company: ${companyName}`
        );
        return;
      }
      const perpetualGrowthRate = parseFloat(growthRateData.Rate);

      const marketValueData = marketValues.find(
        (value) => value.Company === companyName
      );
      if (!marketValueData) {
        console.error(`Market value not found for company: ${companyName}`);
        return;
      }
      const marketValueNumber = parseFloat(
        marketValueData.MarketValue.replace(/,/g, "")
      );

      const intrinsicValue = calculateDCF(
        freeCashFlowsNumbers,
        desiredReturn,
        perpetualGrowthRate
      );
      const intrinsicValueWithMargin = intrinsicValue * (1 - marginOfSafety);

      const isUndervalued = intrinsicValueWithMargin > marketValueNumber;

      results.push({
        Company: companyName,
        IntrinsicValue: intrinsicValueWithMargin.toFixed(2),
        MarketValue: marketValueNumber.toFixed(2),
        Undervalued: isUndervalued ? "Yes" : "No",
      });
    });

    // Debug: Log the results
    console.log("Results:", results);

    results.sort(
      (a, b) => parseFloat(b.IntrinsicValue) - parseFloat(a.IntrinsicValue)
    );

    res.json(results);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Start the server
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
