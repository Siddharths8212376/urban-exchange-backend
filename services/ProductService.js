const { ObjectId } = require("mongodb");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));
const Product = require("../models/product");
const UserService = require("../services/UserService");
const HashTagService = require("../services/HashTagService");
const { getProductCategoryFields } = require("../metadata/ProductConfig");
const PRODUCT_CATEGORIES = [
    "Books",
    "Electronics",
    "Clothing",
    "Vehicles",
    "Accessories",
];
const PRODUCT_CATEGORIES_METADATA = [];
PRODUCT_CATEGORIES.forEach(category => {
    PRODUCT_CATEGORIES_METADATA.push({
        category: category,
        fields: getProductCategoryFields(category)
    });
});
const STATES_INFO = [
    ["Andhra Pradesh", "AP"],
    ["Arunachal Pradesh", "AR"],
    ["Assam", "AS"],
    ["Bihar", "BR"],
    ["Chhattisgarh", "CG"],
    ["Goa", "GA"],
    ["Gujarat", "GJ"],
    ["Haryana", "HR"],
    ["Himachal Pradesh", "HP"],
    ["Jammu and Kashmir", "JK"],
    ["Jharkhand", "JH"],
    ["Karnataka", "KA"],
    ["Kerala", "KL"],
    ["Madhya Pradesh", "MP"],
    ["Maharashtra", "MH"],
    ["Manipur", "MN"],
    ["Meghalaya", "ML"],
    ["Mizoram", "MZ"],
    ["Nagaland", "NL"],
    ["Odisha", "OD"],
    ["Punjab", "PB"],
    ["Rajasthan", "RJ"],
    ["Sikkim", "SK"],
    ["Tamil Nadu", "TN"],
    ["Telangana", "TS"],
    ["Tripura", "TR"],
    ["Uttarakhand", "UK"],
    ["Uttar Pradesh", "UP"],
    ["West Bengal", "WB"],
    ["Andaman and Nicobar Islands", "AN"],
    ["Chandigarh", "CH"],
    ["Dadra and Nagar Haveli", "DN"],
    ["Daman and Diu", "DD"],
    ["Delhi", "DL"],
    ["Lakshadweep", "LD"],
    ["Puducherry", "PY"],
];
const createProduct = async (req, res, next) => {
    const productTag = req.body.tag;
    const productImages = [];
    const pinValidationInfo = await fetchAndValidatePIN(
        req.body.pincode,
        req.body.state
    );
    console.log(pinValidationInfo, "validationInfo");

    if (pinValidationInfo.status == false) {
        res.status(400).json({
            status: "failure",
            message: "Invalid PIN/State information",
        });
        return;
    } else {
        const result = pinValidationInfo.result;
        if (result.length > 0) {
            let i = 0;
            while (i < result.length) {
                if (result[i].longitude !== "" && result[i].latitude !== "") {
                    let location = [
                        parseFloat(result[i].longitude),
                        parseFloat(result[i].latitude),
                    ];
                    /**
                     * for geo-spatial query
                     * always store in [long, lat] format in that order, also these values should be floats
                     * create an index in db
                     * db.products.createIndex({"address.location": "2dsphere"});
                     **/
                    req.body.location = {
                        type: "Point",
                        coordinates: location,
                    };
                    req.body.locationMeta = result;
                    break;
                }
                i++;
            }
        }
    }
    const seller = req.body.seller;
    const sellerInfo = await UserService._getUserById(seller);
    if (sellerInfo) {
        req.body.sellerUname = sellerInfo.username;
    }
    fs.readdir(`${process.cwd()}/images/product`, async (err, files) => {
        if (err) {
            console.error(err);
        } else {
            files.forEach((file) => {
                let fileName = path.basename(file, path.extname(file));
                let fileTag = fileName.split("---")[2];
                if (fileTag && fileTag.includes(productTag)) productImages.push(file);
            });
            req.body.productImages = productImages;
            let hashtags = req.body.hashtags;
            hashtags.push(req.body.category.toLocaleLowerCase());
            await HashTagService.createOrUpdateHashTags(hashtags);
            await persistProduct(req, res, next);
        }
    });
};
const persistProduct = async (req, res, next) => {
    const product = new Product({
        name: req.body.name,
        price: req.body.price,
        description: req.body.description,
        note: req.body.note ? req.body.note : "",
        modelNo: req.body.modelNo ? req.body.modelNo : "",
        category: req.body.category ? req.body.category : "",
        seller: req.body.seller ? req.body.seller : new ObjectId(),
        sellerUname: req.body.sellerUname ? req.body.sellerUname : "",
        boughtBy: req.body.boughtBy ? req.body.boughtBy : null,
        tag: req.body.tag,
        productImages: req.body.productImages,
        created: new Date(),
        lastUpdated: new Date(),
        hashtags: req.body.hashtags,
        metadata: req.body.metadata,
        address: {
            location: req.body.location, // for geospatial query
            state: req.body.state,
            pin: req.body.pincode,
            meta: req.body.locationMeta,
        },
    });
    await product.save().then(
        async (createdProduct) => {
            await UserService.addToUserProductsPersist(
                req.body.seller,
                createdProduct._id
            ).then(
                (result) => {
                    res.status(201).json({
                        message: "Product added successfully, User products updated",
                        productId: createdProduct._id,
                    });
                },
                (error) => {
                    console.error(error);
                    res.status(404).json({
                        message: "User Not Found",
                        data: null,
                    });
                }
            );
        },
        (error) => {
            console.error(error);
            res.status(503).json({
                message: "Product Creation Failure",
                data: null,
            });
        }
    );
};
const getPostalInfo = async (req, res, next) => {
    const pin = req.body.pin;
    const state = req.body.state;
    const postalInfo = await fetchAndValidatePIN(pin, state);
    res.status(200).json({
        status: "success",
        data: postalInfo,
    });
};
const fetchAndValidatePIN = async (pin, state) => {
    // world postal collection
    let POSTAL_API = `https://api.worldpostallocations.com/pincode?postalcode=${pin}&countrycode=IN&apikey=2214-3bb5aa38-0f4b44fa-af775401-e089c5667195928dc34`;
    const response = await fetch(POSTAL_API);
    const postalInfo = await response.json();
    return postalInfo;
};
const createProductTag = async (req, res, next) => {
    const productTag = crypto.randomBytes(16).toString("hex");
    res.status(201).json({
        message: "Created product tag",
        data: productTag,
    });
};
const getAllProducts = async (req, res, next) => {
    Product.find().then((products) => {
        res.status(200).json({
            message: "Products fetched successfully!",
            data: products,
        });
    });
};
const getProductById = async (req, res, next) => {
    Product.findOne({ _id: req.params.id }).then(
        (product) => {
            res.status(200).json({
                message: "Product fetched successfully",
                data: product,
            });
        },
        (error) => {
            console.error(error);
            res.status(404).json({
                message: "Product Not Found",
                data: null,
            });
        }
    );
};
const deleteProductById = async (req, res, next) => {
    Product.findOneAndDelete({ _id: req.params.id }).then(
        (result) => {
            let productImages = result.productImages;
            fs.readdir(`${process.cwd()}/images/product`, async (err, files) => {
                if (err) {
                    console.error(err);
                } else {
                    files.forEach((file) => {
                        let fileName = path.basename(file);
                        if (productImages.includes(fileName)) {
                            fs.unlink(`${process.cwd()}/images/${fileName}`, (err) => {
                                if (err && err.code == "ENOENT") {
                                    console.info("File doesn't exist, won't remove it.");
                                } else if (err) {
                                    console.error("Error occurred while trying to remove file");
                                } else {
                                    console.info(`removed`);
                                }
                            });
                        }
                    });
                }
            });
            res.status(200).json({ message: "Products deleted!" });
        },
        (error) => {
            console.error(error);
            res.status(404).json({
                message: "Product Not Found",
                data: null,
            });
        }
    );
};
const getProductCategories = async (req, res, next) => {
    let metadata = [];
    PRODUCT_CATEGORIES_METADATA.forEach(cat => {
        let fields = JSON.parse(JSON.stringify(cat.fields));
        let category = cat.category;
        let field = fields.find(f => ['genre', 'subCategory', 'brand'].includes(f.label));
        let options = [], subOptions = [];
        if (field) {
            options = field.options;
            let metaData = field.metadata;
            if (metaData) {
                metaData.forEach(meta => {
                    let metaFields = meta.fields.filter(f => ['type', 'subCategory', 'color', 'storageCapacity', 'cellularTech'].includes(f.label));
                    metaFields.forEach(metaField => {
                        if (metaField) {
                            subOptions.push({
                                category: meta.category,
                                field: metaField.fieldName,
                                options: metaField.options
                            });
                        }
                    })

                })
            }
        }
        metadata.push({
            category: category,
            options: options,
            subOptions: subOptions,
        });
    })
    res.status(200).json({
        message: "Fetched product categories",
        data: PRODUCT_CATEGORIES,
        metadata: metadata,
    });
};
const getCreateProductFields = async (req, res, next) => {
    let createProductFields = [
        {
            label: "name",
            fieldName: "Product Name",
            type: "text",
            required: true,
            multiple: false,
        },
        {
            label: "category",
            fieldName: "Category",
            type: "select",
            required: true,
            multiple: false,
            options: PRODUCT_CATEGORIES,
            metadata: PRODUCT_CATEGORIES_METADATA,
        },
        {
            label: "price",
            fieldName: "Price",
            type: "number",
            required: true,
            multiple: false,
        },
        {
            label: "description",
            fieldName: "Description",
            type: "textarea",
            required: true,
            multiple: false,
        },

        {
            label: "state",
            fieldName: "State",
            type: "autocomplete",
            required: true,
            multiple: false,
            options: STATES_INFO,
        },
        {
            label: "pincode",
            fieldName: "PIN",
            type: "number",
            required: true,
            multiple: false,
        },
        {
            label: "note",
            fieldName: "Note",
            type: "textarea",
            required: false,
            multiple: false,
        },
        {
            label: "images",
            fieldName: "Images",
            type: "file",
            required: true,
            multiple: true,
        },
        {
            label: "hashtags",
            fieldName: "Hash Tags",
            type: "hashtag",
            required: false,
            multiple: false,
        },

    ];
    res.status(200).json({
        message: "Fetched create product fields",
        data: createProductFields,
    });
};
const getProductsByPageNoAndPageSizeAndOrCategory = async (req, res, next) => {
    // assign default page number and page size
    // require total length for pagination
    let latitude = (req.query.latitude && req.query.latitude != '') ? req.query.latitude : '';
    let longitude = (req.query.longitude && req.query.longitude != '') ? req.query.longitude : '';
    if (
        !req.query.page ||
        !req.query.limit ||
        (req.query.limit && Number(req.query.limit) == 0)
    ) {
        req.query.page = req.query.page ? req.query.page : 0;
        req.query.limit = req.query.limit ? req.query.limit : 25;
    }
    let page = Number(req.query.page);
    let limit = Number(req.query.limit);
    let category = req.query.category;
    let subfiltersL1, subfiltersL2, subfilters;
    if (category) {
        subfilters = String(category).split('|');
        if (subfilters.length > 1) {
            subfiltersL1 = subfilters[1];
            if (subfilters[2].length > 0) subfiltersL2 = subfilters[2];
            if (subfiltersL2) {
                subfiltersL2 = subfiltersL2.split(',');
            }
        }
    }

    let categoryExists = false;
    if (!category) {
        category = /./;
    } else {
        category = [String(category).split("|")[0]];
        categoryExists = true;
    }

    let data;
    if (latitude != '' && longitude != '') {
        data = await Product.aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [Number(longitude), Number(latitude)] },
                    distanceField: "dist.calculated", // where the distance will be stored
                    maxDistance: 1000000, // 10 kilometers in meters
                    spherical: true
                }
            },
            { $match: { category: categoryExists ? { $in: category } : category } },
            {
                $facet: {
                    products: [{ $skip: page * limit }, { $limit: limit }],
                    totalProducts: [{ $count: "count" }],
                },
            },
        ]);
    }
    else {
        data = await Product.aggregate([
            { $match: { category: categoryExists ? { $in: category } : category } },
            {
                $facet: {
                    products: [{ $skip: page * limit }, { $limit: limit }],
                    totalProducts: [{ $count: "count" }],
                },
            },
        ]);
    }
    let products = data[0].products;
    products = products.filter(p => {
        let filter = true;
        if (subfiltersL1) {
            if (p.metadata && ![p.metadata.subCategory, p.metadata.genre, p.metadata.brand].includes(subfiltersL1) || !p.metadata) filter = false;
        }
        if (subfiltersL2) {
            let subfound = false;
            subfiltersL2.forEach(sf => {
                if (p.metadata && Object.values(p.metadata).includes(sf)) {
                    subfound = true;
                    return;
                }
            })
            if (!subfound || !p.metadata) filter = false;
        }
        return filter;
    })
    data[0].products = products;
    data[0].totalProducts = [{ count: products.length }];
    res.json({
        message: "successfully fetched products",
        data: data,
        page: page,
        limit: limit,
    });
};
const search = async (req, res, next) => {
    let searchItem = req.params.searchItem;
    if (searchItem) searchItem = searchItem.trim();
    let projections = {
        name: 1,
        category: 1,
    };
    try {
        let autoComplete = await Product.aggregate([
            {
                $search: {
                    index: "searchProducts",
                    autocomplete: {
                        query: `${searchItem}`,
                        path: "name",
                        fuzzy: {
                            maxEdits: 2,
                            prefixLength: 3,
                        },
                    },
                },
            },
            {
                $project: {
                    ...projections,
                    score: { $meta: "searchScore" },
                },
            },
        ])
            .sort({ score: -1 })
            .limit(5);
        let searchResults = await Product.aggregate([
            {
                $search: {
                    index: "searchProductsTxt",
                    text: {
                        query: `${searchItem}`,
                        path: {
                            wildcard: "*",
                        },
                        fuzzy: {
                            maxEdits: 2,
                            prefixLength: 3,
                        },
                    },
                },
            },
            {
                $project: {
                    ...projections,
                    score: { $meta: "searchScore" },
                },
            },
        ])
            .sort({ score: -1 })
            .limit(5);
        autoComplete.forEach((res) => {
            if (
                !searchResults.find((r) => {
                    return r._id.toString() == res._id.toString();
                })
            )
                searchResults.push(res);
        });
        // sort in descending order of scores
        searchResults = searchResults.sort((a, b) => b.score - a.score);
        res.send({
            message: "Success",
            data: searchResults,
        });
    } catch (error) {
        console.error(error);
        res.status(404).json({
            message: "Product Not Found",
            data: null,
        });
    }
};
const getProductsByIdList = async (req, res, next) => {
    const idList = req.body.idList;
    try {
        let products = await Product.find({ _id: { $in: idList } });
        res.status(200).json({
            message: "Product list by ids fetched successfully",
            data: products,
        });
    } catch (error) {
        console.error(error);
        res.status(404).json({
            message: "Product Not Found",
            data: null,
        });
    }
};
const validateIfPinCodeMatchesState = async (req, res, next) => {
    let attributeValue = req.body.attributeValue;
    let postalBaseUrl = `https://api.postalpincode.in/pincode/${attributeValue}`;
    const response = await fetch(postalBaseUrl);
    const data = await response.json();
    res.status(200).json({
        status: "success",
        data: data,
    });
};
module.exports = {
    createProduct,
    getAllProducts,
    getProductById,
    deleteProductById,
    createProductTag,
    getCreateProductFields,
    getProductCategories,
    getProductsByPageNoAndPageSizeAndOrCategory,
    search,
    getProductsByIdList,
    getPostalInfo,
    fetchAndValidatePIN,
    validateIfPinCodeMatchesState
};
