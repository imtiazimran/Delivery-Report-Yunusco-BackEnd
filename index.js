const express = require("express")
const app = express()
const cors = require("cors")
const port = process.env.PORT || 8570
require("dotenv").config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middlewere
app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@cluster0.5ujci4u.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const DB = client.db('DeliveryReport')
    const HTLDelivery = DB.collection("HTL")
    const Delivered = DB.collection('DELIVERED')

    app.post("/addJobs", async (req, res) => {
      const newJob = req.body;

      // Check if the job with the same 'po' already exists
      const existingJob = await HTLDelivery.findOne({ po: newJob.po });
      if (existingJob) {
        res.status(400).send("Job with this PO already exists.");
        return;
      }

      // Insert the new job if 'po' is unique
      const result = await HTLDelivery.insertOne(newJob);
      res.send(result);
    });


    app.get("/delivery", async (req, res) => {
      const allDelivery = await HTLDelivery.find().toArray()
      res.send(allDelivery)
    })

    app.put("/markDelivered/:id", async (req, res) => {
      const jobId = req.params.id;
      const query = { _id: new ObjectId(jobId) };

      try {
        // Find the job in HTLDelivery collection
        const job = await HTLDelivery.findOne(query);
        if (!job) {
          res.status(404).send("Job not found.");
          return;
        }

        // Check if the job with the same _id already exists in Delivered collection
        const existingDeliveredJob = await Delivered.findOne(query);
        if (existingDeliveredJob) {
          res.status(400).send("Job is already marked as delivered.");
          return;
        }

        // Remove the _id field from the job document
        delete job._id;

        // Get the current date
        const deliveryDate = new Date();

        const goodsDeliveryDate = `${deliveryDate.getDate().toString().padStart(2, '0')}-${(deliveryDate.getMonth() + 1).toString().padStart(2, '0')}-${deliveryDate.getFullYear()} ${deliveryDate.getHours().toString().padStart(2, '0')}:${deliveryDate.getMinutes().toString().padStart(2, '0')}:${deliveryDate.getSeconds().toString().padStart(2, '0')}`;

       


        // Insert the job into Delivered collection along with the delivery date
        const result = await Delivered.insertOne({
          ...job,
          goodsDeliveryDate, // Add the delivery date to the document
        });

        // Delete the job from HTLDelivery collection
        await HTLDelivery.deleteOne(query);

        res.send(result);
      } catch (error) {
        console.error("Error marking job as delivered:", error);
        res.status(500).send("Internal server error.");
      }
    });


    app.delete("/deleteJob/:id", async (req, res) => {
      const jobId = req.params.id
      console.log(jobId)
      const query = { _id: new ObjectId(jobId) }
      const result = await HTLDelivery.deleteOne(query)
      res.send(result)
    })

    app.get("/delivered", async (req, res) => {
      const allDelivered = await Delivered.find().toArray()
      res.send(allDelivered)
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get("/", (req, res) => {
  res.send("Welcome to Yunusco T&A (BD) LTD.")
})

app.listen(port, () => {
  console.log(`Hazi Yunus Is Running On Port: ${port}`)
})