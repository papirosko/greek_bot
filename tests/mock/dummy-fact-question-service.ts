export class DummyFactQuestionService {
  async generate() {
    return {
      fact: "Η μέρα έχει 24 ώρες.",
      question: "Πόσες ώρες έχει η μέρα;",
      options: ["12", "24", "48", "7"],
      correctIndex: 1,
    };
  }
}
