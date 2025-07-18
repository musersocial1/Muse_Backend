const Card = require("../model/card");
const User = require("../model/user");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.addCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { paymentMethodId } = req.body;

    const user = await User.findById(userId);
    if (!user.stripeCustomerId) {
      return res.status(400).json({ message: "Stripe customer not found." });
    }

    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripeCustomerId,
    });

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const { last4, brand, exp_month, exp_year } = paymentMethod.card;
    const cardholderName = paymentMethod.billing_details.name;

    const card = await Card.create({
      user: userId,
      paymentMethodId,
      last4,
      brand,
      expMonth: exp_month,
      expYear: exp_year,
      cardholderName,
    });

    res.status(201).json({ message: "Card added.", card });
  } catch (err) {
    res.status(500).json({ message: "Failed to add card.", error: err.message });
  }
};

exports.getCards = async (req, res) => {
    try {
      const userId = req.user.id;
      const cards = await Card.find({ user: userId }).select("-__v");
      res.json({ cards });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch cards.", error: err.message });
    }
};

exports.deleteCard = async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const card = await Card.findOne({ _id: id, user: userId });
      if (!card) return res.status(404).json({ message: "Card not found." });
  
      await stripe.paymentMethods.detach(card.paymentMethodId);
  
      await card.deleteOne();
  
      res.json({ message: "Card deleted." });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete card.", error: err.message });
    }
};
  