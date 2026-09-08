import Foundation

struct UserProfile: Identifiable, Codable {
    var id: String
    var name: String = ""
    var email: String = ""
    var admin: Bool = false
    var support: Bool = false
    var profilePhotoDataUrl: String = ""
    var address: Address = Address()
}

struct Address: Codable, Hashable {
    var street: String = ""
    var zip: String = ""
    var city: String = ""
}

struct Product: Identifiable, Codable, Hashable {
    var id: String
    var title: String
    var description: String
    var category: String
    var itemType: String
    var cover: String
    var price: Double
    var downloadPrice: Double
    var printPrice: Double
    var priceEbook: Double?
    var isbn: String?
    var isbnEbook: String?
    var stock: Int
    var sold: Int
    var active: Bool
    var publishedAtMs: Double
    var previewPages: [String]?
    var productImages: [String]?
    var isGift: Bool?
    var giftThreshold: Double?
    var giftRequiresBook: Bool?
    var giftRequirementType: String?
    var variants: [ProductVariant]?
}

struct ProductVariant: Codable, Hashable {
    var name: String
    var price: Double
}

struct CartItem: Identifiable, Hashable, Codable {
    var id: String { "\(product.id)-\(format)-\(variant ?? "none")" }
    var product: Product
    var format: String
    var quantity: Int
    var unitPrice: Double
    var variant: String?
}

struct Order: Identifiable, Codable {
    var id: String
    var orderNumber: String
    var customerName: String
    var customerEmail: String
    var total: Double
    var status: String
    var fulfillmentStatus: String?
    var shipmentStatus: String?
    var trackingNumber: String?
    var trackingUrl: String?
    var sendcloudParcelId: String?
    var shippingLabelUrl: String?
    var createdAtMs: Double
    var archived: Bool
    var type: String?
    var giftVoucher: [String: Any]?
    var items: [[String: Any]]?

    enum CodingKeys: String, CodingKey {
        case id, orderNumber, customerName, customerEmail, total, status, fulfillmentStatus, shipmentStatus, trackingNumber, trackingUrl, sendcloudParcelId, shippingLabelUrl, createdAtMs, archived, type
    }

    // Manual decoding for [String: Any] and [[String: Any]] because they are not Codable by default
    init(id: String, orderNumber: String, customerName: String, customerEmail: String, total: Double, status: String, fulfillmentStatus: String? = nil, shipmentStatus: String? = nil, trackingNumber: String? = nil, trackingUrl: String? = nil, sendcloudParcelId: String? = nil, shippingLabelUrl: String? = nil, createdAtMs: Double = 0, archived: Bool = false, type: String? = nil, giftVoucher: [String: Any]? = nil, items: [[String: Any]]? = nil) {
        self.id = id
        self.orderNumber = orderNumber
        self.customerName = customerName
        self.customerEmail = customerEmail
        self.total = total
        self.status = status
        self.fulfillmentStatus = fulfillmentStatus
        self.shipmentStatus = shipmentStatus
        self.trackingNumber = trackingNumber
        self.trackingUrl = trackingUrl
        self.sendcloudParcelId = sendcloudParcelId
        self.shippingLabelUrl = shippingLabelUrl
        self.createdAtMs = createdAtMs
        self.archived = archived
        self.type = type
        self.giftVoucher = giftVoucher
        self.items = items
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        orderNumber = try container.decode(String.self, forKey: .orderNumber)
        customerName = try container.decode(String.self, forKey: .customerName)
        customerEmail = try container.decode(String.self, forKey: .customerEmail)
        total = try container.decode(Double.self, forKey: .total)
        status = try container.decode(String.self, forKey: .status)
        fulfillmentStatus = try container.decodeIfPresent(String.self, forKey: .fulfillmentStatus)
        shipmentStatus = try container.decodeIfPresent(String.self, forKey: .shipmentStatus)
        trackingNumber = try container.decodeIfPresent(String.self, forKey: .trackingNumber)
        trackingUrl = try container.decodeIfPresent(String.self, forKey: .trackingUrl)
        sendcloudParcelId = try container.decodeIfPresent(String.self, forKey: .sendcloudParcelId)
        shippingLabelUrl = try container.decodeIfPresent(String.self, forKey: .shippingLabelUrl)
        createdAtMs = try container.decode(Double.self, forKey: .createdAtMs)
        archived = try container.decode(Bool.self, forKey: .archived)
        type = try container.decodeIfPresent(String.self, forKey: .type)
        // [String: Any] can't be decoded easily with standard Codable, but we are using REST results in AppState
        giftVoucher = nil
        items = nil
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(orderNumber, forKey: .orderNumber)
        try container.encode(customerName, forKey: .customerName)
        try container.encode(customerEmail, forKey: .customerEmail)
        try container.encode(total, forKey: .total)
        try container.encode(status, forKey: .status)
        try container.encodeIfPresent(fulfillmentStatus, forKey: .fulfillmentStatus)
        try container.encodeIfPresent(shipmentStatus, forKey: .shipmentStatus)
        try container.encodeIfPresent(trackingNumber, forKey: .trackingNumber)
        try container.encodeIfPresent(trackingUrl, forKey: .trackingUrl)
        try container.encodeIfPresent(sendcloudParcelId, forKey: .sendcloudParcelId)
        try container.encodeIfPresent(shippingLabelUrl, forKey: .shippingLabelUrl)
        try container.encode(createdAtMs, forKey: .createdAtMs)
        try container.encode(archived, forKey: .archived)
        try container.encodeIfPresent(type, forKey: .type)
    }
}

struct GiftVoucher: Identifiable, Codable {
    var id: String
    var code: String
    var amount: Double
    var remainingAmount: Double
    var status: String
}

struct ISBNEntry: Identifiable, Codable {
    var id: String
    var isbn: String
    var title: String
    var price: Double?
    var used: Bool
}

struct NewsletterPost: Identifiable, Codable {
    var id: String
    var title: String
    var text: String
    var image: String
    var createdAtMs: Double
    var hidden: Bool
}

struct GlobalStats: Codable {
    var orderCount: Int = 0
    var totalRevenue: Double = 0.0
    var lastUpdateMs: Double = 0.0
}

struct SupportContribution: Identifiable, Codable {
    var id: String
    var name: String
    var amount: Double
    var createdAtMs: Double
}
