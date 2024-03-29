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
    const Sample = DB.collection('SAMPLE')
    const User = DB.collection('USER')




    // store user 
    app.post('/postUser', async (req, res) => {
      const newUser = req.body;
      // check if user exist with same email
      const existingUser = await User.findOne({ email: newUser.email })

      if (existingUser) {
        res.status(400).send("user already register with this email")
        return
      }
      const result = await User.insertOne(newUser)
      res.send(result)

    })
    // get users
    app.get('/users', async (req, res) => {
      const result = await User.find().toArray()
      res.send(result)
    })
    // find logged User
    app.get('/currentUser/:email', async (req, res) => {
      const userEmail = req.params.email;
      const result = await User.findOne({ email: userEmail })
      res.send(result)
    })

    // update User Role as admin
    app.patch('/user/admin/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await User.updateOne(query, { $set: { role: "Admin" } });
      res.send(result)
    })

    // update User as editor
    app.patch('/user/editor/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await User.updateOne(query, { $set: { role: "Editor" } });
      res.send(result)
    })

    // delete User 
    app.delete('/user/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await User.deleteOne(query);
      res.send(result)
    })


    // add jobs
    app.post("/addJobs", async (req, res) => {
      const newJob = req.body;
      // Check if the job with the same 'po' already exists
      const existingJob = await Delivered.findOne({ po: newJob.po });
      if (existingJob) {
        res.status(400).send("Job with this PO already exists.");
        return;
      }

      const currentDate = new Date();


      // Get the current date
      const JobAddDate = `${currentDate.getDate().toString().padStart(2, '0')}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getFullYear()}`;

      // Insert the new job if 'po' is unique
      const result = await Delivered.insertOne({
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

    // ---------------------------------------------------------------------------------------------------
    app.get('/sample', async (req, res) => {
      const result = await Sample.find().toArray()
      res.send(result)
    })
    // sample entry
    app.post('/addSample', async (req, res) => {
      const newSample = req.body
      const result = await Sample.insertOne(newSample)
      res.send(result)
    })

    // update sample
    app.put('/updateSample/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const newSample = req.body;
      // Exclude _id field from the update
      delete newSample._id;
      const result = await Sample.updateOne(query, { $set: newSample });
      res.send(result);
    });


    // delete sample
    app.delete('/deleteSample/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await Sample.deleteOne(query)
      res.send(result)
    })


    // handle delivery
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

        const goodsDeliveryDate = `${deliveryDate.getDate().toString().padStart(2, '0')}-${(deliveryDate.getMonth() + 1).toString().padStart(2, '0')}-${deliveryDate.getFullYear()}`;



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
        const goodsDeliveryDate = `${deliveryDate.getDate().toString().padStart(2, '0')}-${(deliveryDate.getMonth() + 1).toString().padStart(2, '0')}-${deliveryDate.getFullYear()}`;
        // Create the partial delivery document
        const partialDelivery = {
          _id: partialDeliveryId,
          customar: job.customar,
          po: job.po,
          qty: partialDeliveryQty, // Use the partial delivery quantity
          label: job.label,
          goodsDeliveryDate: goodsDeliveryDate, // Use the current date as delivery date
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
    // insert new partial delivery quantity
    app.post("/insertNewPartialDelivery", async (req, res) => {
      const pdData = req.body;

      try {
        // Create the partial delivery document
        const partialDelivery = {
          ...pdData,
          qty: pdData.partialDeliveryQty, // Use the partial delivery quantity
        };

        // Insert the partial delivery document into Delivered collection
        await Delivered.insertOne(partialDelivery);

        // Update the remaining quantity in HTLDelivery collection
        const remainingQty = pdData.totalQty - pdData.partialDeliveryQty;
        // await HTLDelivery.updateOne(query, { $set: { qty: remainingQty, deliveryType: "partial" } });
        await HTLDelivery.insertOne({
          ...pdData,
          qty: remainingQty,
          deliveryType: "partial"
        })

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
      const result = await Delivered.find().toArray()

      res.send(result);
    });
    // app.get("/delivered", async (req, res) => {
    //   const { month } = req.query;
    //   let filteredDeliveredJobs;

    //   console.log(month);
    //   if (month) {
    //     // If the month query parameter is provided, filter delivered jobs by the selected month
    //     filteredDeliveredJobs = await Delivered.find({
    //       goodsDeliveryDate: { $regex: new RegExp(`\\d{2}-(0?${month})-\\d{4}`), },
    //     }).toArray();
    //   } else {
    //     // If no month is specified, fetch all delivered jobs
    //     filteredDeliveredJobs = await Delivered.find().sort({ goodsDeliveryDate: -1 }).toArray();
    //   }

    //   res.send(filteredDeliveredJobs);
    // });



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
  console.log(`Hazi Yunus Is Running On Port: ${port}`)
})