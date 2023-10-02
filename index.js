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
const deliveryDate = new Date();
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const DB = client.db('DeliveryReport')
    const HTLDelivery = DB.collection("HTL")
    const Delivered = DB.collection('DELIVERED')
    const User = DB.collection('USER')




    // store user 
    app.post('/postUser', async (req, res) => {
      const newUser = req.body;
      // check if user exist with same email
      const existingUser = await User.findOne({ email: newUser.email })

      console.log("newUser:", newUser, "existing User:", existingUser);
      if (existingUser) {
        res.status(400).send("user already register with this email")
        return
      }
      const result = await User.insertOne(newUser)
      res.send(result)

    })
    // get users
    app.get('/users', async(req, res) =>{
      const result = await User.find().toArray()
      res.send(result)
    })

    app.post("/addJobs", async (req, res) => {
      const newJob = req.body;
console.log(newJob);
      // Check if the job with the same 'po' already exists
      const existingJob = await HTLDelivery.findOne({ po: newJob.po });
      if (existingJob) {
        res.status(400).send("Job with this PO already exists.");
        return;
      }


      // Get the current date
      const JobAddDate = `${deliveryDate.getDate().toString().padStart(2, '0')}-${(deliveryDate.getMonth() + 1).toString().padStart(2, '0')}-${deliveryDate.getFullYear()} ${deliveryDate.getHours().toString().padStart(2, '0')}:${deliveryDate.getMinutes().toString().padStart(2, '0')}:${deliveryDate.getSeconds().toString().padStart(2, '0')}`;

      // Insert the new job if 'po' is unique
      const result = await HTLDelivery.insertOne({
        ...newJob,
        JobAddDate,
      });
      res.send(result);
    });

    // display the delivery lists
    app.get("/delivery", async (req, res) => {
      const allDelivery = await HTLDelivery.find().sort({ JobAddDate: -1 }).toArray()
      res.send(allDelivery)
    })



    // handle delivery
    app.put("/markDelivered/:id", async (req, res) => {
      const jobId = req.params.id;
      const query = { _id: new ObjectId(jobId) };
console.log();
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

        const goodsDeliveryDate = `${deliveryDate.getDate().toString().padStart(2, '0')}-${(deliveryDate.getMonth() + 1).toString().padStart(2, '0')}-${deliveryDate.getFullYear()} ${deliveryDate.getHours().toString().padStart(2, '0')}:${deliveryDate.getMinutes().toString().padStart(2, '0')}:${deliveryDate.getSeconds().toString().padStart(2, '0')}`;


        
        // Insert the job into Delivered collection along with the delivery date
        const result = await Delivered.insertOne({
          ...job,
          goodsDeliveryDate, // Add the delivery date to the document
        });
        
        console.log(goodsDeliveryDate);
        // Delete the job from HTLDelivery collection
        await HTLDelivery.deleteOne(query);

        res.send(result);
      } catch (error) {
        console.error("Error marking job as delivered:", error);
        res.status(500).send("Internal server error.");
      }
    });

    // handle partial delivery

    app.put("/updatePartialDelivery/:id", async (req, res) => {
      const jobId = req.params.id;
      const { partialDeliveryQty } = req.body;

      const query = { _id: new ObjectId(jobId) };

      try {
        // Find the job in HTLDelivery collection
        const job = await HTLDelivery.findOne(query);
        if (!job) {
          res.status(404).send("Job not found.");
          return;
        }

        // Check if the partial delivery quantity is valid
        if (partialDeliveryQty <= 0 || partialDeliveryQty > job.qty) {
          res.status(400).send("Invalid partial delivery quantity.");
          return;
        }

        // Create a new _id for the partial delivery document
        const partialDeliveryId = new ObjectId();
        const deliveryDate = new Date();
        const goodsDeliveryDate = `${deliveryDate.getDate().toString().padStart(2, '0')}-${(deliveryDate.getMonth() + 1).toString().padStart(2, '0')}-${deliveryDate.getFullYear()} ${deliveryDate.getHours().toString().padStart(2, '0')}:${deliveryDate.getMinutes().toString().padStart(2, '0')}:${deliveryDate.getSeconds().toString().padStart(2, '0')}`;
        // Create the partial delivery document
        const partialDelivery = {
          _id: partialDeliveryId,
          customar: job.customar,
          po: job.po,
          qty: partialDeliveryQty, // Use the partial delivery quantity
          label: job.label,
          goodsDeliveryDate: goodsDeliveryDate // Use the current date as delivery date
        };

        // Insert the partial delivery document into Delivered collection
        await Delivered.insertOne(partialDelivery);

        // Update the remaining quantity in HTLDelivery collection
        const remainingQty = job.qty - partialDeliveryQty;
        await HTLDelivery.updateOne(query, { $set: { qty: remainingQty, deliveryType: "partial" } });

        res.send("Partial delivery marked successfully.");
      } catch (error) {
        console.error("Error marking partial delivery:", error);
        res.status(500).send("Internal server error.");
      }
    });



    // handle Delete Proccesing job
    app.delete("/deleteJob/:id", async (req, res) => {
      const jobId = req.params.id
      // console.log("from Proccesing:",jobId)
      const query = { _id: new ObjectId(jobId) }
      const result = await HTLDelivery.deleteOne(query)
      res.send(result)
    })

    // handle Delete Delivered job
    app.delete("/deleteDeliveredJob/:id", async (req, res) => {
      const jobId = req.params.id
      const query = { _id: new ObjectId(jobId) }
      // console.log("from Delivered:",jobId, "query:", query)
      const result = await Delivered.deleteOne(query)
      res.send(result)
    })

    // handle all Delivered Job List
    app.get("/delivered", async (req, res) => {
      const allDelivered = await Delivered.find().sort({ goodsDeliveryDate: -1 }).toArray()
      res.send(allDelivered)
    })

    // handle Edited Job
    app.put("/editedJob/:id", async (req, res) => {
      const jobId = req.params.id;
      const query = { _id: new ObjectId(jobId) };
      const { updatedQuantity, updatedDeliveryDate } = req.body;

      const result = await Delivered.updateOne(query, { $set: { qty: updatedQuantity, goodsDeliveryDate: updatedDeliveryDate } })
      res.send(result)

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
  console.log(`Hazi Yunus Is Running On Port: ${port}`, deliveryDate)
})