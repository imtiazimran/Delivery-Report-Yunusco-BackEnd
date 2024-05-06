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
    // --------------------------------------------------------------------------------------------------------------------------

    // add jobs
    app.post("/addJobs", async (req, res) => {
      const newJob = req.body;
      // Check if the job with the same 'po' already exists
      const existingJob = await Delivered.findOne({ po: newJob.po });
      const existing = await HTLDelivery.findOne({ po: newJob.po });
      if (existingJob) {
        res.status(400).send("Job with this PO already exists.");
        return;
      }

      if (existing) {
        const res = await HTLDelivery.deleteOne({ po: newJob.po });
        res.status(400).send("This job is in proccessing");
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
      try {
        const allDelivery = await HTLDelivery.find().sort({ _id: -1 }).toArray();
        res.send(allDelivery);
      } catch (error) {
        res.status(500).json({ error: 'An error occurred while fetching delivery data' });
      }
    });

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
    // --------------------------------------------------------------------------------------------------------------------------

    app.post('/addToProcess', async (req, res) => {
      const newJob = req.body
      const query = { po: newJob.po }
      try {
        const existingJob = await HTLDelivery.findOne(query)
        const delivered = await Delivered.findOne(query)
        if (existingJob || delivered) {
          res.status(400).json({
            success: false,
            message: 'job already exists'
          })
          return;
        }


        const result = await HTLDelivery.insertOne(newJob)
        res.status(200).json({
          success: true,
          message: 'job added successfully',
          result
        })
      } catch (error) {
        res.statusCode(500).json({
          message: 'failed to add job',
          error: error
        })
      }
    })

    // refresh
    app.get('/refresh', async (req, res) => {
      try {
        const delivered = await Delivered.find().toArray();
        const proccessing = await HTLDelivery.find().toArray();

        const matchingPOs = proccessing.map(item => item.po);
        const deletePromises = [];
        const deletedItems = [];

        delivered.forEach(deliveredItem => {
          if (matchingPOs.includes(deliveredItem.po)) {
            const matchedProcessingItem = proccessing.find(item => item.po === deliveredItem.po);
            if (!matchedProcessingItem || !matchedProcessingItem.hasOwnProperty("deliveryType")) {
              const deletedItem = {
                po: deliveredItem.po,
                qty: deliveredItem.qty
              };
              deletedItems.push(deletedItem);
              deletePromises.push(HTLDelivery.deleteOne({ po: deliveredItem.po }));
            }
          }
        });

        // Execute all delete operations
        await Promise.all(deletePromises);

        res.status(200).json({ message: 'Data refreshed successfully', deletedItems });
      } catch (error) {
        res.status(500).json({ error: 'An error occurred while refreshing data' });
      }
    });





    // search

    app.get('/search/:po', async (req, res) => {
      const po = req.params.po;
      const query = { po: po };
      try {
        const result = await HTLDelivery.find(query).exec(); // Use exec() to return a Promise
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });


    // handle delivery
    app.put("/markDelivered/:id", async (req, res) => {
      const jobId = req.params.id;
      const query = { _id: new ObjectId(jobId) };
      const po = req.body.po;
      try {
        // Find the job in HTLDelivery collection
        const job = await HTLDelivery.findOne(query);
        if (!job) {
          res.status(404).send("Job not found.");
          return;
        }

        // Check if the job with the same _id already exists in Delivered collection
        const existingDeliveredJob = await Delivered.findOne({ po });
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
          customer: job.customer,
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
      const searchTerm = req.query.searchTerm; // Assuming the search term is provided in the query parameter
      const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
      const limit = parseInt(req.query.limit) || 10; // Default limit to 10 items per page if not provided
      try {

        let query = {};
        if (searchTerm) {
          query = {
            $or: [
              { customar: { $regex: searchTerm, $options: 'i' } },
              { po: { $regex: searchTerm, $options: 'i' } },
              { label: { $regex: searchTerm, $options: 'i' } },
              { goodsDeliveryDate: { $regex: searchTerm, $options: 'i' } }
            ]
          };
        } // Constructing the MongoDB query
        const totalItems = await Delivered.countDocuments(query); // Count total items for pagination
        const total = await Delivered.find().toArray();

        const totalQty = total.reduce((accumulator, currentJob) => {
          const qtyAsNumber = parseInt(currentJob.qty); // Convert the string to an integer
          if (!isNaN(qtyAsNumber)) {
            return accumulator + qtyAsNumber;
          }
          return accumulator; // If conversion fails, return the accumulator unchanged
        }, 0);

        // Calculate pagination values
        const totalPages = Math.ceil(totalItems / limit);
        const offset = (page - 1) * limit;

        const deliveredItems = await Delivered.find(query)
          .sort({ _id: -1 })
          .skip(offset)
          .limit(limit)
          .toArray(); // Fetching items based on the query, limit, and offset

        const currentTQty = deliveredItems.reduce((accumulator, currentJob) => {
          const qtyAsNumber = parseInt(currentJob.qty); // Convert the string to an integer
          if (!isNaN(qtyAsNumber)) {
            return accumulator + qtyAsNumber;
          }
          return accumulator; // If conversion fails, return the accumulator unchanged
        }, 0);
        // console.log(deliveredItems)
        res.json({
          totalPages,
          currentPage: page,
          totalItems,
          deliveredItems,
          totalQty,
          currentTQty
        });
      } catch (error) {
        res.status(500).send(error.message); // Handle error
      }
    });

    app.get('/getAllDelivered', async (req, res) => {
      try {
        const delivered = await Delivered.find().sort({ _id: -1 }).toArray();
        res.status(200).json({
          success: true,
          message: "Delivered jobs fetched successfully",
          data: delivered
        })
      } catch (error) {
        res.status(500).json({ success: false, message: error.message, error: error })
      }
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
  console.log(`Hazi Yunus Is Running On Port: ${port}`)
})