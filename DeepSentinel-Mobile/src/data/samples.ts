import type { Transaction } from "../api/analyze";

/**
 * Real PaySim rows, taken from the Query Runner's sample file.
 *
 * Not invented. A fabricated transaction in a fraud tool is a liability: it
 * either behaves unlike the data the models were fitted on, which makes the
 * demonstration meaningless, or it behaves exactly like it and becomes
 * indistinguishable from a real detection.
 *
 * The four are chosen to be an honest test rather than a flattering one: two
 * the dataset labels fraudulent, two it does not, and among the normal ones a
 * transfer larger than either fraud. A detector that simply flags large
 * amounts fails this set, and it should be visible when it does.
 */

export type Sample = {
  label: string;
  note: string;
  /**
   * The dataset's own label. Never sent to the models — it is not part of the
   * transaction and would not exist at screening time. Shown only after a
   * result comes back, so the score can be read against it.
   */
  isFraud: boolean;
  transaction: Transaction;
};

export const SAMPLES: Sample[] = [
  {
    label: "Emptied transfer",
    note: "Origin drained to zero, destination previously empty",
    isFraud: true,
    transaction: {
      step: 385,
      type: "TRANSFER",
      amount: 868004.25,
      nameOrig: "C1630644567",
      oldbalanceOrg: 868004.25,
      newbalanceOrig: 0.0,
      nameDest: "C183532439",
      oldbalanceDest: 0.0,
      newbalanceDest: 868004.25,
      isFlaggedFraud: 0,
    },
  },
  {
    label: "Emptied cash-out",
    note: "The same shape, on the other side of the pair",
    isFraud: true,
    transaction: {
      step: 551,
      type: "CASH_OUT",
      amount: 759257.25,
      nameOrig: "C1255221578",
      oldbalanceOrg: 759257.25,
      newbalanceOrig: 0.0,
      nameDest: "C1470118163",
      oldbalanceDest: 0.0,
      newbalanceDest: 759257.25,
      isFlaggedFraud: 0,
    },
  },
  {
    label: "Large but ordinary",
    note: "Bigger than either fraud above, and the balance still adds up",
    isFraud: false,
    transaction: {
      step: 18,
      type: "TRANSFER",
      amount: 1203555.62,
      nameOrig: "C627494563",
      oldbalanceOrg: 4814222.48,
      newbalanceOrig: 3610666.86,
      nameDest: "C1474823472",
      oldbalanceDest: 0.0,
      newbalanceDest: 1203555.62,
      isFlaggedFraud: 0,
    },
  },
  {
    label: "Routine cash-out",
    note: "Small, partial withdrawal from a funded account",
    isFraud: false,
    transaction: {
      step: 322,
      type: "CASH_OUT",
      amount: 28888.03,
      nameOrig: "C1121646574",
      oldbalanceOrg: 115552.12,
      newbalanceOrig: 86664.09,
      nameDest: "C1102949900",
      oldbalanceDest: 0.0,
      newbalanceDest: 28888.03,
      isFlaggedFraud: 0,
    },
  },
];
